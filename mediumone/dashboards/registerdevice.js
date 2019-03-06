(function () {
    'use strict';

    angular
        .module('app.ta_register_device', ['app.tenant_info_service_v2'])
        .controller('TARegisterDeviceController', TARegisterDeviceController);

    TARegisterDeviceController.$inject = ['$scope', '$http', 'TenantInfoServiceV2'];

    function TARegisterDeviceController($scope, $http, TenantInfoServiceV2) {
        var vm = this;

        activate();
        vm.loading_string = 'Loading...';

        ////////////////

        function activate() {

            vm.processing = false;
            vm.active = {};
            vm.active.step1 = true;
            vm.active.step2 = false;
            vm.active.reg_btn = false;

            vm.device_linked = vm.loading_string;

            var load_devices = function() {
                TenantInfoServiceV2.devices().then(
                    function(devices) {
                        vm.devices = devices;
                        vm.device_linked = vm.devices.length > 0;
                    },
                    function(error) {
                        console.log("error loading devices: ", error);
                        vm.devices = [];
                        vm.device_linked = false;
                    }
                );
            }


            vm.unregister_device = function(device) {
                var device_id = device.device_id;
                $http.delete('/api/v2/devices/unregister/' + device_id).then(
                    function(response) {
                        console.log("successfully unregistered device: ", response);
                        load_devices();
                    },
                    function(error) {
                        console.log("error: ", error);
                        load_devices();
                    }
                );
            }


            vm.step1Handler = function () {
                /**
                 * TODO: Send Verification Request to Server
                 */

                vm.step1MSG = '';
                vm.step1_msg_color = 'red';
                vm.active.step1 = false;

                var valid = vm.data.device_id.match(/^[0-9a-zA-Z\-._@+]{2,64}$/);
                if (vm.data.device_id.length > 64 || vm.data.device_id.length < 2) {
                    vm.step1_msg_color = 'red';
                    vm.step1MSG = 'Invalid Device ID, must be between 2 and 64 characters';
                    return;
                }
                if (!valid) {
                    vm.step1_msg_color = 'red';
                    vm.step1MSG = 'Invalid Device ID.  Allowed characers: letters digits . + - _ @';
                    return;
                }



                var success = function (res) {
                    console.log('success', res);
                    vm.step1_msg_color = 'green'
                    vm.step1MSG = 'Device Registered Successfully';
                    load_devices();
                }

                var fail = function (err) {
                    console.log('error', err);
                    vm.step1MSG = err.data.title;
                    vm.step1_msg_color = 'red';
                    load_devices();
                }

                var promise = $http.post('/api/v2/devices/register/' + vm.data.device_id);
                promise.then(success, fail);

            }

            load_devices();


        }
    }
})();