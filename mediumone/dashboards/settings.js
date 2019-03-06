(function () {
    'use strict';

    angular
        .module('app.pillbox_settings', ['app.device_data_service', 'app.tenant_info_service_v2'])
        .controller('PillboxSettingsController', [
        '$scope', '$q', 'DeviceDataService', 'TenantInfoService', '$timeout','$http',
            function($scope, $q, DeviceDataService, TenantInfoServiceV2, $timeout, $http) {


          var vm = this;
          vm.alarms = [];
          vm.phones = [];
          vm.timezones = [];
          var max_alarms = 20;
          var max_phones = 10;

          var device_id_promise = $http.get('/device_list_in_tenant');

            vm.can_add_alarm = function() {
                return vm.alarms.length < max_alarms;
            }

            vm.can_add_phone = function() {
                return vm.phones.length < max_phones;
            }


          vm.add_alarm = function() {
                console.log("Adding alarm");

                var max_id = vm.alarms.map(function(x) {
                    return x.num;
                }).reduce(function(x, y) {
                    return Math.max(x,y) || 0;
                }, 0);

                vm.alarms.push({'num': max_id+1,
                                'name': "schedule_" + (max_id+1)});
            };

            vm.remove_alarm = function(alarm_id) {
                vm.alarms = vm.alarms.filter(function(x) {
                    return (x.num !== alarm_id);
                });
            }


            vm.add_phone = function() {
                var max_id = vm.phones.map(function(x) {
                    return x.num;
                }).reduce(function(x, y) {
                    return Math.max(x,y) || 0;
                }, 0);
              vm.phones.push({'num': max_id+1});
            };

            vm.remove_phone = function(phone_id) {
                vm.phones = vm.phones.filter(function(x) {
                    return (x.num !== phone_id);
                });
            }


            var save = function() {
                var transformed_alarms = vm.alarms.map(function(alarm) {
                    var obj = angular.copy(alarm);
                    if(obj.time) {
                        // this is a terrible hack
                        // to interpret a given hour:minute time in a different timezone
                        var date_portion = moment(new Date(obj.time.toLocaleString())).format().substring(0, 19);
                        var tz_portion = moment(new Date(obj.time.toLocaleString())).tz(vm.timezone).format().substring(19);
                        obj.time = moment(date_portion+tz_portion).utc().format();

                    }
                    return obj;
                });

                var alarms = JSON.parse(angular.toJson(transformed_alarms)); // remove $$hashkey and other angular crap
                var phones = JSON.parse(angular.toJson(vm.phones));

                var alarms_promise = DeviceDataService.create_event({
                    'event_data': {'alarms': alarms},
                    'stream': 'settings',
                    'device_id': vm.device_id
                });

                var phones_promise = DeviceDataService.create_event({
                    'event_data': {'phones': phones},
                    'stream': 'settings',
                    'device_id': vm.device_id
                });

                var tz_promise = DeviceDataService.create_event({
                    'event_data': {'timezone': vm.timezone},
                    'stream': 'settings',
                    'device_id': vm.device_id
                });

              $q.all([alarms_promise, phones_promise]).then(
                  function(responses) {
                        console.log("successfully saved data: ", responses);
                    },
                  function(error) {
                      console.log("error saving data: ", error);
                    }
              );

            };

            var load_data = function() {
              DeviceDataService.device_last_value({
                      'tags': ['settings.alarms', 'settings.phones', 'settings.timezone'],
                      'device_id': vm.device_id
                }).then(
                  function(data) {
                        vm.alarms = data.values['settings.alarms'] || [];
                        vm.alarms.forEach(function(val) {
                            if(val.time) {
                                val.time = new Date(val.time);
                            }
                        });
                        vm.phones = data.values['settings.phones'] || [];

                        vm.timezone = data.values['settings.timezone'];
                    }
                ).then(function() {
                    var debounced_save = _.debounce(save, 200);
                    var maybe_save = function(new_val, old_val) {

                        if(new_val !== old_val) {
                            debounced_save();
                        }
                    }
                    $scope.$watch(function() {
                        return vm.alarms;
                    }, maybe_save, true);

                    $scope.$watch(function() {
                        return vm.phones;
                    }, maybe_save, true);

                    $scope.$watch(function() {
                        return vm.timezone;
                    }, maybe_save, true);

                })
            };

            var load_timezones = function() {
                var tz_names = moment.tz.names();
                vm.timezones = tz_names;
            }

            var activate = function() {
                if(moment.tz === undefined) {
                    $timeout(activate, 200);
                } else {
                    load_timezones();
                    
                    device_id_promise.then(function(response) {
                        var devices = response.data; // might be an empty list
                        vm.device_id = devices[0].device_id;
                        load_data();
                    },function (error) {
                        console.log("Failed to get device_id", error);
                    });
                   
                }

            };

            activate();

    }]);

})();