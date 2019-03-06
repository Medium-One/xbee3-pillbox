(function() {
    'use strict';
    


    angular
        .module('app.Dashboard', ['app.device_data_service', 'oitozero.ngSweetAlert'])
        
        .service('ScriptLoaderService',['$q',  function($q){
            var id = 0;
            this.loadScript = function (src) {
              var promise = $q.defer();
              var script = document.createElement("script");
              script.setAttribute("id", "scriptloaderservice-" + id);
              var tmp_id = id;
              script.type = "text/javascript";

              script.onload = function() {
                  promise.resolve({id: "scriptloaderservice-" + tmp_id.toString()});
              }
              id = id + 1;
              document.getElementsByTagName("head")[0].appendChild(script);
              script.src = src;

              return promise.promise;
            }
        }])

        .controller('DashboardController', ['$scope', '$http', '$state', 'DeviceDataService','$timeout', 'ScriptLoaderService','SweetAlert',




            function($scope, $http, $state, DeviceDataService, $timeout, ScriptLoaderService, SweetAlert) {


                var date_window_size;
                var vm = this;
                
              var script_loader_ids = [];
              var SCRIPT_LIST = [
               "https://cdn.jsdelivr.net/npm/daterangepicker/daterangepicker.min.js", 
              ];
                function cleanup_loadedScript() {
                  script_loader_ids.forEach(function(id) {
                    var element = document.getElementById(id);
                    element.parentNode.removeChild(element);
                  });
                }

              var device_id_promise = $http.get('/device_list_in_tenant');

              /*--- Date range picker ---BEGIN---*/
                vm.datepicker_objects = [];

                function cleanup_datepickers() {
                    if(vm.datepicker_objects) {
                    vm.datepicker_objects.forEach(function(obj) {
                        obj.data('daterangepicker').remove();
                    });
                    }
                    vm.datepicker_objects = [];
                }

                $scope.$on('$destroy', function() {
                    cleanup_datepickers();
                    cleanup_loadedScript();
                });

                function initDateRangePicker() {
                    /**
                     * Date Range Picker
                     */
                    var datepickers = [{
                        id: '#date-select',
                        vm_start_key: 'logs_table_daterange_start',
                        vm_end_key: 'logs_table_daterange_end'
                    }];

                    function make_callback(datepicker) {
                        var datepicker_id = datepicker.id;
                        var vm_start_key = datepicker.vm_start_key;
                        var vm_end_key = datepicker.vm_end_key

                        return function(start, end) {
                            vm[vm_start_key] = start;
                            vm[vm_end_key] = end;

                            var duration = end - start;
                            if (duration < moment.duration(1, 'day')) {
                                vm.binning_label = '';
                            } else if (duration < moment.duration(7, 'days')) {
                                vm.binning_label = 'hourly average';
                            } else {
                                vm.binning_label = 'daily average';
                            }

                            $(datepicker_id + ' span').html(start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));


                            date_window_size = end.diff(start, 'days');

                            if ($scope.$root.$$phase != '$apply' && $scope.$root.$$phase != '$digest') {
                                $scope.$apply();
                            }
                        }
                    };


                    vm.datepicker_objects = datepickers.map(function(datepicker) {

                        var cb = make_callback(datepicker);

                        var datepicker = $(datepicker.id).daterangepicker({
                            startDate: moment().subtract(29, 'days').startOf('day'),
                            endDate: moment().endOf('day'),
                            dateLimit: {
                                "months": 3
                            },
                            ranges: {
                                'Today': [moment().startOf('day'), moment().endOf('day')],
                                'Yesterday': [moment().subtract(1, 'days').startOf('day'), moment().subtract(1, 'days').endOf('day')],
                                'Last 7 Days': [moment().subtract(6, 'days').startOf('day'), moment().endOf('day')],
                                'Last 30 Days': [moment().subtract(29, 'days').startOf('day'), moment().endOf('day')],
                                'This Month': [moment().startOf('month'), moment().endOf('month')],
                                'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
                            },
                            opens: 'left'
                        }, cb);

                        cb(moment().subtract(29, 'days').startOf('day'), moment().endOf('day'));
                        return datepicker;
                    });

                }
                /*--- Date range picker ---END---*/




          /*---Notifications---BEGIN---*/

             vm.logs_table_tabs = [{
                    "name": "Alert Logs",
                    "stream": "alerts",
                    "tags": [{
                        'tag': 'alerts.message',
                        'name': 'Alerts'
                    }]
                },

                {
                    "name": "Box Door Logs",
                    "stream": "raw",
                    "tags": [{
                        'tag': 'raw.box_close',
                        'name': 'Message'
                    }]
                }

            ];

            vm.logs_selected_tab = 0;

            //$scope.notifsLoaded = false;
            vm.filteredNotifications = [];
            vm.notifPageNum = 1;
            $scope.maxNotifsOnPage = 10;
            function initializationNotificationTable(){

                vm.notifPageNum = 1;
                $scope.maxNotifsOnPage = 10;

                vm.setMaxPages();
                $scope.notifsLoaded = true;
            }



            vm.setMaxPages = function() {

                $scope.maxPages = Math.ceil(parseFloat(vm.filteredNotifications.length) / parseFloat($scope.maxNotifsOnPage))

                vm.notifPageNum = 1;
            }





            //Special message process for different tag

            function messageHelper(d){
                var result = "";

                if (d.tag === "raw.box_close") {
                        result += d.message ? "closed" : "open";
                } else {
                    result += d.message;
                }

                return result;
            }


            var update_logs_table = function() {
                    $scope.notifsLoaded = false;
                    var tab = vm.logs_table_tabs[vm.logs_selected_tab];
                    var tags = tab.tags;

                    var start = vm.logs_table_daterange_start;
                    var end = vm.logs_table_daterange_end;

                    var tags_tag_map = {};
                    tags.forEach(function(t){
                        tags_tag_map[t.tag] = t;
                    });


                    var promise;


                    promise = DeviceDataService.device_tag_values({
                        'device_ids': vm.device_id,
                        'since': start.format(),
                        'until': end.format(),
                        'tags': tags.map(function(t){return t.tag}),
                        'sort_by': 'observed_at'
                    }).then(
                        function(response) {

                            response = response || [];
                            var data = [];

                            response.forEach(function(res){

                                var title = tags_tag_map[res.tag].name;
                                var tag = res.tag;
                                res.data.forEach(function(d){
                                    var row = {};
                                    row['time'] = d[0];
                                    row['message'] = d[1];
                                    row['title'] = title;
                                    row['tag'] = tag;
                                    data.push(row);
                                });

                            });
                            data.sort(function(a,b){
                                if (a.time >= b.time){
                                    return -1;
                                } else {
                                    return 1;
                                }
                            });



                            data.forEach(function(d) {
                                d.time = moment(Date.parse(d.time)).format('LLLL');
                                d.message = messageHelper(d);
                            });
                            return data;

                        });


                    promise.then(function(data) {
                        vm.filteredNotifications = data;

                        initializationNotificationTable();

                    }, function(error) {
                        SweetAlert.swal("Error loading table data");
                        console.log("error loading logs table: ", error);
                    });
                }



            vm.isNotificationDisplay = function(index){

                var count_index = index;

                return (count_index >= ((vm.notifPageNum - 1) * $scope.maxNotifsOnPage) &&  count_index < (vm.notifPageNum * $scope.maxNotifsOnPage));
            }



            /*---Notifications---END---*/

                var NO_DEVICE_MESSAGE = "No device linked. Please go to Register Device page";


                var activate = function() {

                    /*  initialize daterange picker */

                        initDateRangePicker();
                  
                    /**** watch tag and daterange for chart, and reload chart when it changes ***/

                    device_id_promise.then(function(response) {
                        var devices = response.data; // might be an empty list
                        if (devices.length == 0) {
                            vm.no_device_message = NO_DEVICE_MESSAGE;
                            return;
                        }
                        vm.device_id = devices[0].device_id;

                        $scope.$watch(
                            function() {
                                return [vm.logs_selected_tab,
                                    vm.logs_table_daterange_start,
                                    vm.logs_table_daterange_end
                                ];
                            },
                            function(nval, oval) {


                               update_logs_table();
                            },
                            true
                        );
                    }, function (error){
                        console.log("Failed to get device_id,", error);
                    });

               }

                /////////////// START HERE /////////////////////////
            
                var scriptLoaderPromises = [];
                
                SCRIPT_LIST.forEach(function(src) {
                    var promise = ScriptLoaderService.loadScript(src);
                    scriptLoaderPromises.push(promise);
                });
                Promise.all(scriptLoaderPromises).then(function(values) {
                  for (var i = 0; i < values.length; i++) {
                    if (!values[i].hasOwnProperty("id")) {
                        console.log("Failed to load scripts");
                        return
                    } else {
                        script_loader_ids.push(values[i].id);
                    }
                  }
                  activate();
                }, function(err){
                  console.log("loading error", err);
                });




            }
        ]);
})();