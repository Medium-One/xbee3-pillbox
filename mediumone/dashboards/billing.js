(function() {
    "use strict";



    var formatPlanAmount = function(plan) {
        var currency = plan.currency.toUpperCase();

        var amount;
        if (plan.amount != undefined) {
            amount = plan.amount;
            if (currency != 'USD')
                console.log("Got non-usd current!");
            else
                amount /= 100;
            return amount + " " + currency;
        } else if (plan.tiers) {
           
            var amount_string = "";
            for (var i = 0; i < plan.tiers.length; i++) {
                amount = plan.tiers[i].amount;
                if (currency == 'USD')
                    amount /= 100;
                if (plan.tiers[i].up_to)
                    amount_string += amount.toString() + " per device up to " + plan.tiers[i].up_to + " devices, ";
                else
                    amount_string += amount.toString() + " per device  ";
            }
           
            return null;
        }
    }

    var formatPlanFrequency = function(plan) {
        if(plan.interval_count == 1) {
            return plan.interval;
        } else {
            return plan.interval_count + ' ' + plan.interval + 's';
        }
    }

    var formatPlanDisplay = function(plan) {
        var amount = formatPlanAmount(plan);
        if (amount)
            return plan.name + " (" + formatPlanAmount(plan) + " per " + formatPlanFrequency(plan) + ")";
        else
            return plan.name;
    }


    angular
        .module('app.c_billing', ['oitozero.ngSweetAlert'])
        .controller('TaBillingController',
                    ['$scope', '$http', '$timeout', '$element', '$uibModal', 'SweetAlert', 'Menu', 'SwitchTenant',
            function($scope, $http, $timeout, $element, $uibModal, SweetAlert, Menu, SwitchTenant) {

                var vm = this;

                vm.tables = ['Billing History'];
                vm.current_table = vm.tables[0];


                var show_error = function(title, text) {
                    SweetAlert.swal({
                        title: title,
                        text: text
                    });
                }

                var post_with_error_msg = function(url, data_dict, err_msg) {
                    var promise = $http({method: 'POST',
                                         url: url,
                                         data: data_dict});

                    promise.then(function(result) {
                        $scope.get_current_plan();
                        var data = result.data;
                        if(data != 'Success') { show_error(err_msg, data); }
                    },
                        function(error) {
                            show_error(err_msg, error.data.title);
                        }
                    );

                    return promise;
                }


                var switchTenant = function (tenant_id, new_subscription) {
                    SwitchTenant.switch(tenant_id);
                };

                var switchTenantForSubscribe = function(response) {
                    switchTenant(response, true);
                }

                var switchTenantForUnsubscribe = function(response) {
                    switchTenant(response, false);
                }


                $scope.delete_account = function() {

                    SweetAlert.swal({
                        title: "Are you sure you want to end your subscription?",
                        text: 'Your service will stop at the end of the current period, and your payment method will \
                                be removed. Please enter your password to confirm. You will not be able to undo this \
                                action.',
                        type: 'input',
                        inputType: 'password',
                        showCancelButton: true,
                        confirmButtonColor: '#DD6B55',
                        confirmButtonText: 'Yes',
                        cancelButtonText: 'No',
                        closeOnConfirm: true,
                        closeOnCancel: true
                    }, function (inputValue) {

                        if (inputValue) {

                            post_with_error_msg('/api/v2/billing_unsubscribe',
                                                {password: inputValue},
                                                'Error unsubscribing account:').then(


                                    function() {
                                        Menu.getMyrolePromise().then(function (myrole) {
                                                switchTenantForUnsubscribe(myrole.current_tenant_id)
                                        });
                                    },
                                    function() {});

                        }
                    });
                }

                $scope.check_plan = function (plan_id) {
                    var selected_plan = $scope.available_plans.find(function (p) {return p.id == plan_id});
                    if (selected_plan) {
                        if (selected_plan.amount == 0)
                            $scope.show_credit_card = false;
                        else
                            $scope.show_credit_card= true;
                    }
                };


                $scope.update_cc_modal = function() {
                    $scope.show_credit_card_form = true;
                    $scope.disabled = false;
                    $scope.card     = {number: "", exp_month: "", exp_year: "", cvc: ""};


                    $http.get('/api/v2/billing_stripe_publishable_key').then(function (result) {
                        $scope.key = "";
                        var data = angular.fromJson(result.data);
                        if (data.hasOwnProperty('key')) {
                            $scope.key = data['key'];
                        }
                    });
                }
                $scope.cancel_cc_modal = function() {
                    $scope.show_credit_card_form = false;
                }
                $scope.update_cc = function() {
                    // make sure all fields exist
                    if(!$scope.card.number || !$scope.card.exp_year ||
                       !$scope.card.exp_month || !$scope.card.cvc || $scope.key == ""
                       ) {
                        return;
                    }
                    Stripe.setPublishableKey($scope.key);

                    function stripeResponseHandler(status, response) {
                        var $form = $('#card_form_update');

                        if (response.error) {
                            // Show the errors on the form
                            $form.find('.payment-errors').text(response.error.message);
                            $form.find('button').prop('disabled', false);
                            $scope.disabled = false;

                            $scope.get_current_plan();
                            show_error('Error updating credit card information:', error);
                        }
                        else {
                            // response contains id and card, which contains additional card details
                            var token = response.id;

                            post_with_error_msg('/api/v2/billing_update_cc', {token: token},
                                                'Error updating credit card information:')
                            .then(function(res){
                                     $scope.show_credit_card_form = false;
                                }, function(err) {
                                    show_error('Error happened when updating subscription', err);
                                }

                            );

                            return false
                        }
                    }

                    $scope.disabled = true;
                    var $form       = $('#card_form_update');
                    $scope.loading = true;
                    Stripe.card.createToken($form, stripeResponseHandler);


                }


                $scope.add_subscription_modal = function(){
                    $scope.disabled = false;
                    $scope.card = {number: "", exp_month: "", exp_year: "", cvc: ""};
                    $scope.show_add_subscription_form = true;
                    

                    if ($scope.available_plans.length > 0) {
                        vm.subscription_type = $scope.available_plans[0].id;
                        $scope.check_plan(vm.subscription_type);
                    } else {
                        $scope.show_credit_card = false;
                    }


                     $http.get('/api/v2/billing_stripe_publishable_key').then(function (result) {
                        $scope.key = "";
                        var data = angular.fromJson(result.data);
                        if (data.hasOwnProperty('key')) {
                            $scope.key = data['key'];
                        }
                    });
                }

                $scope.cancel_add_subscription_modal = function() {
                    $scope.show_add_subscription_form = false;
                    $scope.show_credit_card = false;
                }

                $scope.add_subscription = function() {
                    if(!vm.subscription_type) {
                        show_error('Wrong Subscription Type', vm.subscription_type);
                        return;
                    }
                    if($scope.key == "" || $scope.show_credit_card && (!$scope.card.number || !$scope.card.exp_year ||
                       !$scope.card.exp_month || !$scope.card.cvc
                       )) {
                        return;
                    }
                    Stripe.setPublishableKey($scope.key);

                    function update_cc_post(data){
                       post_with_error_msg('/api/v2/billing_subscribe',

                                                 {token: data.token,
                                                 subscription_plan_id: data.subscription_plan_id},
                                                'Error creating subscription')
                            .then(function(res){
                                     $scope.show_credit_card = false;
                                     $scope.show_add_subscription_form = false;
                                     location.reload(true);
                                }, function(err) {
                                    show_error('Error happened when creating subscription', err);
                                }

                            );
                    }

                    function stripeResponseHandler(status, response) {
                        var $form = $('#card_form_add');

                        if (response.error) {
                            // Show the errors on the form
                            $form.find('.payment-errors').text(response.error.message);
                            $form.find('button').prop('disabled', false);
                            $scope.disabled = false;

                            $scope.get_current_plan();
                            show_error('Error creating credit card information:', error);
                        }
                        else {
                            // response contains id and card, which contains additional card details
                            var token = response.id;
                                update_cc_post({token: token, subscription_plan_id: vm.subscription_type});



                            return false
                        }
                    }

                    $scope.disabled = true;
                    var $form       = $('#card_form_add');
                    $scope.loading = true;
                    if ($scope.show_credit_card)
                        Stripe.card.createToken($form, stripeResponseHandler);
                    else
                        stripeResponseHandler(0, {error: false});
                }



                $scope.update_subscription_modal = function() {
                    $scope.disabled = false;
                    if($scope.subscription && $scope.subscription.subscription_plan) {
                        vm.subscription_type = $scope.subscription.subscription_plan.id;
                    } else {
                        vm.subscription_type = null;
                    }

                    $scope.show_subscription_dropdown = true;

                }


                $scope.cancel_update_subscription_modal = function() {
                    $scope.show_subscription_dropdown  = false;
                }
                $scope.update_subscription = function() {
                    if(!vm.subscription_type) {
                        show_error('Wrong Subscription Type', vm.subscription_type);
                        return;
                    }

                    $scope.loading = true;

                    post_with_error_msg('/api/v2/billing_update_plan',{subscription_plan_id: vm.subscription_type},'Error updating subscription')
                    .then(function(res){
                            $scope.show_subscription_dropdown  = false;
                        }, function(err) {
                            show_error('Error happened when updating subscription', err);
                        }

                    );

                }





                $scope.formatPlanDisplay = formatPlanDisplay;

                $scope.cardAvailable = function() {
                    return !angular.equals($scope.subscription.account_info.card, {});
                }

                $scope.subscription_status = 'n/a';


                $scope.formatTimestamp = function(ts) {
                    if(ts) {
                        return moment(ts*1000).format("MM/DD/YYYY");
                    } else {
                        return "n/a";
                    }
                }


                $scope.get_current_plan = function() {
                    $scope.loading = true;


                    $http.get('/api/v2/billing_available_plans').then(function(res) {
                        $scope.available_plans = res.data;

                    }, function(err) {
                        show_error('Error retrieving available plans:', err.data.title);
                    });

                    $scope.paymentType = function(payment) {
                        if(payment.amount_refunded > 0) {
                            return 'Refund';
                        } else {
                            return 'Payment';
                        }
                    }

                    $scope.paymentAmount = function(payment) {
                        if(payment.amount_refunded > 0) {
                            return payment.amount_refunded;
                        } else {
                            return payment.amount;
                        }
                    }

                    $scope.capitalize = function(str) {
                        return str.charAt(0).toUpperCase() + str.substring(1);
                    }

                    $scope.formatPaymentAmount = function(amt) {
                        return (amt / 100).toLocaleString()
                    }

                    var get_billing_history = function() {
                        return $http.get('/api/v2/billing_history').then(
                            function(resp) {
                                $scope.payment_history = resp.data;
                            },

                            function(err) {
                                console.log("got error loading payment history: ", err);
                            }
                        );
                    }

                    var get_past_invoices = function() {
                        return $http.get('/api/v2/billing_invoices').then(
                            function(resp) {
                                $scope.past_invoices = resp.data;
                                $scope.past_invoices.forEach(function(invoice){
                                    invoice.invoice_number ="xxxxxxx-" + invoice.number.substring(invoice.number.length - 5);
                                    invoice.plan = (invoice.line_items.length > 1) ? "Multiple Plans":invoice.line_items[0].description;
                                    invoice.status = invoice.paid? "Paid":"Unpaid";
                                });
                            },
                            function(err) {
                                console.log("got error from /billing_invoices: ", err);

                            }
                        )
                    }

                    $scope.upcoming_invoice = null;
                    $http.get('/api/v2/billing_current_plan').then(
                        function(res) {
                            $scope.loading = false;
                            $scope.subscription = res.data;


                            if (res.data.account_info && res.data.account_info.hasOwnProperty('upcoming_invoice') && res.data.account_info.upcoming_invoice.total > 0) {
                            $scope.upcoming_invoice = res.data.account_info.upcoming_invoice;
                            $scope.upcoming_invoice.invoice_number ="xxxxxxx-" + $scope.upcoming_invoice.number.substring($scope.upcoming_invoice.number.length - 5);
                            $scope.upcoming_invoice.plan = ($scope.upcoming_invoice.line_items.length > 1) ? "Multiple Plans":$scope.upcoming_invoice.line_items[0].description;
                            $scope.upcoming_invoice.status = $scope.upcoming_invoice.paid? "Paid":"Unpaid";
                            } else {
                                $scope.upcoming_invoice = null;
                            }
                            if($scope.subscription.status == 'n/a') {
                                $scope.subscription_status = 'n/a';
                            } else {

                                if ($scope.subscription.status.toLowerCase() == 'cancelling')
                                    $scope.subscription_status = 'cancelling';
                                else if ($scope.subscription.status.toLowerCase() == 'past due')
                                    $scope.subscription_status = 'past due';
                                else
                                    $scope.subscription_status = 'active';
                            }
                            if ($scope.subscription_status == "cancelling" || $scope.subscription_status == "active") {
                                get_billing_history();
                                get_past_invoices();
                            }
                        },

                        function(err) {
                            $scope.loading = false;
                            show_error("Error retrieving current plan", err.data.title);
                        });



                }

                $scope.get_current_plan();

            }
        ]);




})();