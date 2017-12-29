
<script type="text/ng-template" id="pedigree">

<div ng-controller="PedigreeController">

    <tab-container>

        <workflow-tab tab-name="Fetch Data" disabled="fetch.disabled">
            <concept-box style="display: inline-block;"
                         concept-group="fetch.conceptBoxes.familyDataIds"
                         type="LD-categorical"
                         min="1"
                         max="1000"
                         label="Family Data"
                         tooltip="For now, please pull in ALL ids from the folders: Subject Id, Maternal Id, Paternal Id.">
            </concept-box>
            <concept-box style="display: inline-block;"
                         concept-group="fetch.conceptBoxes.familyIds"
                         type="LD-categorical"
                         min="1"
                         max="10"
                         label="Family Ids"
                         tooltip="Select the ids of the families that should be displayed.">
            </concept-box>
			<concept-box style="display: inline-block;"
                         concept-group="fetch.conceptBoxes.affectionStatus"
                         type="LD-categorical"
                         min="-1"
                         max="4"
                         label="Affection Status"
                         tooltip="You can select up to four categorical values, that will be visualized as a positive affection in the pedigree.">
            </concept-box>
            <concept-box style="display: inline-block;"
                         concept-group="fetch.conceptBoxes.additionalCategoric"
                         type="LD-categorical"
                         min="-1"
                         max="-1"
                         label="Additional Categoric Variables"
                         tooltip="Select any amout of categorical values. These values will be displayed as text in the pedigree.">
            </concept-box>
			<concept-box style="display: inline-block;"
                         concept-group="fetch.conceptBoxes.additionalNumeric"
                         type="LD-numerical"
                         min="-1"
                         max="-1"
                         label="Additional Numeric Variables"
                         tooltip="Select any amout of numerical values. These values will be displayed as text in the pedigree.">
            </concept-box>
            <hr class="sr-divider">
            <fetch-button concept-map="fetch.conceptBoxes"
                          loaded="fetch.loaded"
                          running="fetch.running"
                          disabled="fetch.button.disabled"
                          message="fetch.button.message"
                          allowed-cohorts="[1,2]">
            </fetch-button>
        </workflow-tab>

        <workflow-tab tab-name="Run Analysis" disabled="runAnalysis.disabled">
            <div class="heim-input-field sr-input-area"></div>
            <hr class="sr-divider">
            <run-button button-name="Create Plot"
                        store-results-in="runAnalysis.scriptResults"
                        script-to-run="run"
                        arguments-to-use="runAnalysis.params"
                        running="runAnalysis.running">
            </run-button>
            <br/>
            <br/>
            <pedigree data="runAnalysis.scriptResults"></pedigree>
        </workflow-tab>

    </tab-container>

</div>

</script>
