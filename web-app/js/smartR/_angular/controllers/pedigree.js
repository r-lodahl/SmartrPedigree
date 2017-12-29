//# sourceURL=pedigree.js

'use strict';

window.smartRApp.controller('PedigreeController', [
    '$scope',
    'smartRUtils',
    'commonWorkflowService',
    function($scope, smartRUtils, commonWorkflowService) {

        commonWorkflowService.initializeWorkflow('pedigree', $scope);

        $scope.fetch = {
            running: false,
            disabled: false,
            button: {
                disabled: false,
                message: ''
            },
            loaded: false,
            conceptBoxes: {
                familyDataIds: {concepts: [], valid: false},
                familyIds: {concepts: [], valid: false},
				affectionStatus: {concepts: [], valid: true},
                additionalCategoric: {concepts: [], valid: true},
				additionalNumeric: {concepts: [], valid: true}
            }
        };

        $scope.runAnalysis = {
            running: false,
            disabled: true,
            scriptResults: {},
            params: {
                transformation: 'raw'
            }
        };

        $scope.$watch(function() {
            return $scope.fetch.conceptBoxes.familyDataIds.concepts.length;
        },
        function() {
            $scope.fetch.button.disabled = false;
            $scope.fetch.button.message = '';
        });

        $scope.$watchGroup(['fetch.running', 'runAnalysis.running'],
            function(newValues) {
                var fetchRunning = newValues[0],
                    runAnalysisRunning = newValues[1];

                // clear old results
                if (fetchRunning) {
                    $scope.runAnalysis.scriptResults = {};
                }

                // disable tabs when certain criteria are not met
                $scope.fetch.disabled = runAnalysisRunning;
                $scope.runAnalysis.disabled = fetchRunning || !$scope.fetch.loaded;
            }
        );

    }]);

