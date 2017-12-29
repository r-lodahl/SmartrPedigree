//# sourceURL=d3Pedigree.js

'use strict';

window.smartRApp.directive('pedigree', [
    'smartRUtils',
    'rServeService',
    function(smartRUtils, rServeService) {

        return {
            restrict: 'E',
            scope: {
                data: '=',
                width: '@',
                height: '@'
            },
            link: function (scope, element) {

                /**
                 * Watch data model (which is only changed by ajax calls when we want to (re)draw everything)
                 */
                scope.$watch('data', function() {
                    $(element[0]).empty();
                    if (! $.isEmptyObject(scope.data)) {
                        smartRUtils.prepareWindowSize(scope.width, scope.height);
                        createPedigreeViz(scope, element[0]);
                    }
                });
            }
        };

		// Main Function for creating the pedigree
        function createPedigreeViz(scope, root) {
			// Contains the viz data
            var dataPed = scope.data.pedData;
			
			// Contains the names of all affection concepts
			var affections = scope.data.affectionData;
			
			// Contains the names of all concepts that contain text
			var textNodes = scope.data.textData;
			
			// Global variable creation
			// This globals are needed because this code will be
			// dynamically called and added to another file
			// Without globals references from buttons to loaded scope
			// Elements would be invalid and a second controller would be required
			window.pedigreeGlobal = {};
			window.pedigreeGlobal.kinship = scope.data.kinship;
			window.pedigreeGlobal.unrelated = scope.data.maxUnrelated;
			window.pedigreeGlobal.hwe = scope.data.hwe;
			window.pedigreeGlobal.allelFrequency = scope.data.allelFrequency;
			
			// Quick variables to check if affection data or text nodes were requested
			var hasAffections = affections != undefined && affections != "" && affections.length > 0;
			var hasTextNodes = textNodes != undefined && textNodes != "" && textNodes.length > 0;
			
			// Check if age was requested
			var hasAge = dataPed[0].Age != undefined;
			
			var affectionsNumber = 0;
			var affectionNames = [];
			
			var textNodeNumber = hasTextNodes? textNodes.length : 0;
			
			// Get names of the affections form the data
			if (hasAffections) {
				affectionsNumber = affections.length;
				for (var j = 0; j < affectionsNumber; j++) {
					for (var k = 0; k < dataPed.length; k++) {
						if (dataPed[k][affections[j]] != "") {
							affectionNames.push(dataPed[k][affections[j]]);
							break;
						}
					}
				}
			}
			
			/////// D3VIZ PEDIGREE ///////
			
			// Create a sub-object for each family in submitted data and index them via their familyId
			var pedDataPerFamily = {};
			window.pedigreeGlobal.pedDataPerFamily = pedDataPerFamily;
			for (i = 0; i < dataPed.length; i++) {
				var node = dataPed[i];
				if (!(node.FamilyId in pedDataPerFamily)) {
					var tmp = {};
					tmp.data = [];
					pedDataPerFamily[node.FamilyId] = tmp;
				}

				pedDataPerFamily[node.FamilyId].data.push(node);
			}

		// For each family, calculate their virutell positions
		for (var family in pedDataPerFamily) {
			var pedFake = pedDataPerFamily[family].data;

			// Build Tree from PED:
			// Roots: All Patients with no recorded father and mother
			// Leaves: All Patients with no children
			// Navigation in both direction via .children, .mother, .father
			var record, roots = [], i, leaves = [], idIndex = {};
			for (i = 0; i < pedFake.length; i++) {
				pedFake[i].children = [];
				pedFake[i].father = null;
				pedFake[i].mother = null;
				pedFake[i].sortedChildren = {};
				pedFake[i].childrenWith = [];
				pedFake[i].generation = 0;
				idIndex[pedFake[i].SubjectId] = pedFake[i];
				leaves.push(pedFake[i]);
			}
			for (i = 0; i < pedFake.length; i++) {
				record = pedFake[i];
				
				// Check for root
				if (record.PaternalId == "None" && record.MaternalId == "None") {
					roots.push(record);
				// Check for "not leaf", if true: remove node from leaves, add mother/father
				} else {
					if (record.PaternalId !== "None") {
						var tmpObj = idIndex[record.PaternalId];
						tmpObj.children.push(record);
						record.father = tmpObj;
						var idx = leaves.indexOf(tmpObj);
						if (idx > -1) leaves.splice(idx, 1);
					}
					if (record.MaternalId !== "None") {
						var tmpObj = idIndex[record.MaternalId];
						tmpObj.children.push(record);
						record.mother = tmpObj;
						var idx = leaves.indexOf(tmpObj);
						if (idx > -1) leaves.splice(idx, 1);
					}
				}
			}
			
			// Save root accessors (needed later for drawing purposes)
			pedDataPerFamily[family].roots = roots;
			  
			// Set additional relationships: which person has which children with whom
			var sortChildren = function(node) {
				
				if (node.father != null) {
					if (node.father.sortedChildren[node.MaternalId] == null) {
						node.father.childrenWith.push(idIndex[node.MaternalId]);
						node.father.sortedChildren[node.MaternalId] = [];
					}
					if (!node.father.sortedChildren[node.MaternalId].includes(node)) node.father.sortedChildren[node.MaternalId].push(node);
					sortChildren(node.father);
				}
				
				if (node.mother != null) {
					if (node.mother.sortedChildren[node.PaternalId] == null) {
						node.mother.childrenWith.push(idIndex[node.PaternalId]);
						node.mother.sortedChildren[node.PaternalId] = [];
					}
					if (!node.mother.sortedChildren[node.PaternalId].includes(node)) node.mother.sortedChildren[node.PaternalId].push(node);
					sortChildren(node.mother);
				}
			}
			
			for (i = 0; i < leaves.length; i++) {
				sortChildren(leaves[i]);
			}
			
			// If there is age in the tree ensure every sortedChildren-Array is sorted by age
			if (hasAge) {
				for (i = 0; i < pedFake.length; i++) {
					for (var otherNode in pedFake[i].sortedChildren) {
						pedFake[i].sortedChildren[otherNode].sort(function(a,b) { return parseInt(b.Age) - parseInt(a.Age); });
					}
				}
			}
			
			// Calculate the generation/depth of every element in the pedigree
			// Generation 0 is the youngest. 
			// We pick one root, start from there and set the generation for ever mother, father, spouse and children 
			// that is found. This is repeated in every new node.
			// Correction is set if a node is negative. After the code will finish
			// all Generations will be raised so that there are no more negative values around
			var oldestGeneration = -1;
			var correction = 0;
			function calculateGeneration(node, generation) {
				if (node.touched) return;
				
				node.generation = generation;
				node.touched = true;
				
				if (generation < correction) correction = generation;
				if (generation > oldestGeneration) oldestGeneration = generation;
				
				if (node.mother != null) {
					calculateGeneration(node.mother, generation+1);
				}
				
				if (node.father != null) {
					calculateGeneration(node.father, generation+1);
				}
				
				for (var j = 0; j < node.childrenWith.length; j++) {
					calculateGeneration(node.childrenWith[j], generation);
				}
				
				for (var j = 0; j < node.children.length; j++) {
					calculateGeneration(node.children[j], generation-1);
				}
			}
			
			// Apply correction value
			calculateGeneration(roots[0], 0);
			correction = Math.abs(correction);
			if (correction != 0) {
				for (var j = 0; j < pedFake.length; j++) {
					pedFake[j].generation += correction;
				}
				oldestGeneration += correction;
			}
			   
			// Calculate virtuel positions
			var maxUsedX = -1;
			var minUsedX = 1000000;
			  
			var famGenPos = []
			var shiftId = 1;
			  
			function getNextSubFamilyId() {
				return famGenPos.length;
			}
			
			// Add virutelgrid / subfamily. each subfamily will be calculated on a separated grid from each other subfamily
			function addFamilyId(subFamilyId) {
				famGenPos[subFamilyId] = [];
				for (var n = 0; n <= oldestGeneration; n++) {
					famGenPos[subFamilyId][n] = 0;
				}
			}
			  
			// Get X-Position for a node. X-Position will be the lowest x value not taken by any of the own or any younger generation
			function getGenerationPosition(subFamilyId, generation) {
				var maxGenX = -1;
				for (var n = generation; n >= 0; n--) {
					if (maxGenX < famGenPos[subFamilyId][n]) maxGenX = famGenPos[subFamilyId][n];
				}
				return maxGenX;
			}
			  
			var calcPosition = function(node, relatedNode, isChild, subFamilyId) {
				if (node == null) return;  // Add a check if we need to clone a node (node + SPOUSE vs node + CHILD) && (node + SPOUSE, SPOUSE SAME FAM BUT NOT SAME GEN)
				
				if (relatedNode == null) {  // Node is new in the tree without any connections
					if (node.position != null) return;
					addFamilyId(subFamilyId);
				} 
				
				if (node.position != null && relatedNode != null) {
				// Clone if node is already in a different subTree or if node is sibling
					if (node.subFamilyId != relatedNode.subFamilyId || node.mother != null && node.father != null && relatedNode.mother == node.mother && relatedNode.father == node.father && relatedNode.generation == node.generation) {
						var newNode = {};
						newNode.original = node;
						newNode.SubjectId = node.SubjectId;
						newNode.PaternalId = node.PaternalId;
						newNode.MaternalId = node.MaternalId;
						newNode.children = node.children;
						newNode.Sex = node.Sex;
						newNode.generation = node.generation;
						
						// 'Check' if relatedNode is parent
						// Change reference of mother and father to clone node
						if (isChild) {
							// Link father and mother in newNode, remove existence of father and mother linkage in original node
							newNode.father = node.father;
							newNode.mother = node.mother;
							node.mother = null;
							node.father = null;
							
							// Change references in parents of node, so that the link to newNode instead of
							var childsOfFather = newNode.father.sortedChildren[newNode.mother.SubjectId];
							var childsOfMother = newNode.mother.sortedChildren[newNode.father.SubjectId];
							childsOfFather[childsOfFather.indexOf(node)] = newNode;
							childsOfMother[childsOfMother.indexOf(node)] = newNode;
							
							// Add spouses to newNode which are not yet placed (== couldnt be placed next to the original node [most often only with spouses > 2])
							newNode.childrenWith = []
							newNode.sortedChildren = {}
							for (var n = 0; n < node.childrenWith.length; n++) {
								if (node.childrenWith[n].subFamilyId == null) {
									newNode.childrenWith.push(node.childrenWith[n]);
									newNode.sortedChildren[node.childrenWith[n].SubjectId] = node.sortedChildren[node.childrenWith[n].SubjectId];
								}
							}
						}
						// If spouse:
						else if (relatedNode.generation > node.generation) { return; } // Dont pull generations upwards in the tree;
						else {
							newNode.mother = null;
							newNode.father = null;
							newNode.childrenWith = [relatedNode];
							newNode.sortedChildren = {};
							newNode.sortedChildren[relatedNode.SubjectId] = relatedNode.sortedChildren[node.SubjectId];
						}
						
						pedFake.push(newNode);
						node = newNode;
					} else {
						return;  // Cannot copy for this node (Node will be copied when relatedNode -> node and node -> relatedNode)
					}
				}
				
				node.subFamilyId = subFamilyId;
				
				var motherX = node.mother != null && node.mother.position != null ? node.mother.position.x : -1;
				var fatherX = node.father != null && node.father.position != null ? node.father.position.x : -1;
				
				var wantedX = getGenerationPosition(subFamilyId, node.generation);
				
				if (motherX < fatherX && motherX > wantedX) wantedX = motherX;
				else if (fatherX < motherX && fatherX > wantedX) wantedX = fatherX;
				
				if (famGenPos[subFamilyId][node.generation] <= wantedX) famGenPos[subFamilyId][node.generation] = wantedX+1;
				
				// Try to ensure: if only one partner: set male partner left and female partner right
				if (!isChild && relatedNode && relatedNode.position && node.childrenWith.length == 1 && relatedNode.childrenWith.length == 1
				&& ((wantedX > relatedNode.position.x && node.Sex == "male") || (wantedX < relatedNode.position.x && node.Sex == "female"))) {
					var tmp = wantedX;
					wantedX = relatedNode.position.x;
					relatedNode.position.x = tmp;
				}
						
				node.position = { y: oldestGeneration - node.generation, x: wantedX};
				
				// Call for spouses and their kids
				for (var v = 0; v < node.childrenWith.length; v++) {
					calcPosition(node.childrenWith[v], node, false, subFamilyId);
					
					for (var w = 0; w < node.sortedChildren[node.childrenWith[v].SubjectId].length; w++) {
						calcPosition(node.sortedChildren[node.childrenWith[v].SubjectId][w], node, true, subFamilyId);
					}
				}
			}
			  
			function shiftPositions(node) {
				/* SHIFTING: Zentriere Nodes möglichst zueinander
				if childMinX+childMaxX > parentMinX + parentMaxX then: shift parents into the center
				else: shift childs into center of parents
				*/
				if (node.position.shiftLevel >= node.generation) return;
				
				for (var v = 0; v < node.childrenWith.length; v++) {
					var partner = node.childrenWith[v];
					var parentMinX, parentMaxX;
					
					if (partner.position.x < node.position.x) {
						parentMinX = partner.position.x;
						parentMaxX = node.position.x;
					} else {
						parentMinX = node.position.x;
						parentMaxX = partner.position.x;
					}
					
					var childs = node.sortedChildren[partner.SubjectId];
					var childrenMinX = childs[0].position.x;
					var childrenMaxX = childs[childs.length-1].position.x;
					
					var childLength = childrenMaxX - childrenMinX;
					var parentLength = parentMaxX - parentMinX;
					
					if (parentLength > childLength) {
						// Center the children to their parents midpoint. By definition their is enough place
						var midPoint = (parentMinX + parentMaxX) / 2.0;
						var childLengthFactor = (childs.length - 1) / 2.0;
						
						for (var w = 0; w < childs.length; w++) {
							
							var spouseMoveFactor = (w - childLengthFactor + midPoint) - childs[w].position.x;
						
							childs[w].position.x += spouseMoveFactor;
							childs[w].position.shiftLevel = node.generation;
							
							for (var j = 0; j < childs[w].childrenWith.length; j++) {
								var spouse = childs[w].childrenWith[j];
								spouse.position.x += spouseMoveFactor;
								spouse.position.shiftLevel = node.generation;
							}
							
						}
					} else {
						// Center the parents to their childrens midpoint. There is always at least as much place as the childs are using. May slightly break centering of parents to THEIR parents.
						var midPoint = (childrenMinX + childrenMaxX) / 2.0;
						
						if (partner.position.x  < node.position.x) {
							partner.position.x = midPoint - 0.5;
							node.position.x = midPoint + 0.5; 
						} else {
							partner.position.x = midPoint + 0.5;
							node.position.x = midPoint - 0.5; 
						}
						
						node.position.shiftLevel = node.generation;
						partner.position.shiftLevel = node.generation;
					}
				}
				
				// We need to check sortedChildren, not children to respect copies
				for (var v in node.sortedChildren) {
					for (var w = 0; w < node.sortedChildren[v].length; w++) {
						shiftPositions(node.sortedChildren[v][w]);
					}
				}
				
			}
			
			// Sort roots by generation, otherwise there WILL BE drawing errors!
			roots.sort(function(a,b) {
				return b.generation - a.generation;
			});
			  
			for (var i = 0; i < roots.length; i++) {
				calcPosition(roots[i], null, false, getNextSubFamilyId());
			}
			  
			for (var i = 0; i < roots.length; i++) {
				shiftPositions(roots[i]);
			}
			  
			// Prepare Draw Data
			var drawMinDistance = 140;
			var drawMinDistanceY = 170;
			var drawSizeOfCell = 50;
			var drawHalfSize = drawSizeOfCell / 2.0;
			var drawPaddingLeft = 20;
			var drawPaddingTop = 10;
			  
			// Get Min/Max Generation foreach subtree and their max-x;
			var subFamilyDrawInfos = [];
			for (var i = 0; i < pedFake.length; i++) {
				var node = pedFake[i];
				
				if (subFamilyDrawInfos[node.subFamilyId] == null) {
					var familyDrawInfo = {};
					familyDrawInfo.maxX = node.position.x;
					familyDrawInfo.minX = node.position.x;
					familyDrawInfo.minY = node.position.y;
					subFamilyDrawInfos[node.subFamilyId] = familyDrawInfo;
				} else {
					var familyDrawInfo = subFamilyDrawInfos[node.subFamilyId];
					if (familyDrawInfo.maxX < node.position.x) familyDrawInfo.maxX = node.position.x;
					if (familyDrawInfo.minX > node.position.x) familyDrawInfo.minX = node.position.x;
					if (familyDrawInfo.minY > node.position.y) familyDrawInfo.minY = node.position.y;
				}
			}
			  
			// Calculate offset in x-axis for every sub-tree
			var preX = drawPaddingLeft;
			for (var i = 0; i < subFamilyDrawInfos.length; i++) {
				var familyDrawInfo = subFamilyDrawInfos[i];
				
				familyDrawInfo.startX = preX;
				preX += drawMinDistance*(familyDrawInfo.maxX+1);
			}
		//Save subFamilyDrawInfos for drawing purposes
		pedDataPerFamily[family].subFamilyDrawInfos = subFamilyDrawInfos;
		}

		// Create next, previous and download Buttons
		var btndiv = d3.select(root).append("div").attr("class", "sideButtonDiv")
		var prevPed = btndiv.append("button").attr("type", "button").attr("id", "prevPedBtn").attr("disabled", "disabled");
		var nextPed = btndiv.append("button").attr("type", "button").attr("id", "nextPedBtn").attr("disabled", "disabled");
		
		btndiv.append("button").attr("type", "button").attr("id", "downloadBtn")
		.text("Export as PNG")
		.on("click", function() {  /* Download function: Put CSS in classes, put svg on canvas, save canvas as png */
			var canvas = document.createElement("canvas");
			var context = canvas.getContext("2d");
			
			// Inline CSS for export
			d3.selectAll(".unaffected").style({"fill": "transparent", "stroke":"black", "stroke-width":"3"});
			d3.selectAll(".affected").style({"fill": "indianred", "stroke":"black", "stroke-width":"3"});
			d3.selectAll(".affected0").style({"fill": "indianred", "stroke":"none"});
			d3.selectAll(".affected1").style({"fill": "dodgerblue", "stroke":"none"});
			d3.selectAll(".affected2").style({"fill": "orange", "stroke":"none"});
			d3.selectAll(".affected3").style({"fill": "blueviolet", "stroke":"none"});
			d3.selectAll(".link").style({"fill": "none"});
			d3.selectAll(".textNode").style({"font-size": "12px"});
			// Inlined
			
			var dlSvg = document.getElementById("pedSVG");
			
			// Change canvas size to pedigree size
			context.canvas.width = dlSvg.width.baseVal.value;
			context.canvas.height = dlSvg.height.baseVal.value;
			
			// Create Download url
			var data = (new XMLSerializer()).serializeToString(dlSvg);
			var domUrl = window.URL || window.webkitURL || window;
			
			var image = new Image();
			var svgBlob = new Blob([data], {type: "image/svg+xml;charset=utf-8"});
			var url = domUrl.createObjectURL(svgBlob);
			
			// Call image download on image load
			image.onload = function() {
				context.drawImage(image, 0, 0);
				domUrl.revokeObjectURL(url);
				
				var imageUri = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
				
				var event = new MouseEvent('click', {
					view: window,
					bubbles: false,
					cancelable: true
				});

				var a = document.createElement('a');
				a.setAttribute('download', 'pedigree.png');
				a.setAttribute('href', imageUri);
				a.setAttribute('target', '_blank');

				a.dispatchEvent(event);
			};
			
			image.src = url;
		});
		
		window.pedigreeGlobal.nextPed = nextPed;
		window.pedigreeGlobal.prevPed = prevPed;
		window.pedigreeGlobal.currentPedIndex = 0;
		window.pedigreeGlobal.pedDataKeys = Object.keys(pedDataPerFamily);
		if (window.pedigreeGlobal.pedDataKeys.length > 1) nextPed.attr("disabled", null);
		
		// Add a header for the colored affection states and to show the current family
		var header = d3.select(root).append("svg").attr("width", 1920).attr("height", 65);
		var famText = header.append("text").attr("class", "headertext").attr("dx", 10).attr("dy", 15).text("Family Id: " + window.pedigreeGlobal.pedDataKeys[0]);
		var textLength = 10;
		for (i = 0; i < affectionsNumber; i++) {
			var legend = affections[i] + ": " + affectionNames[i];
			header.append("rect").attr("x", textLength).attr("y", 30).attr("width", 30).attr("height", 30).attr("class","affected"+i);
			textLength += 35;
			header.append("text").attr("dx", textLength).attr("dy", 50).text(legend);
			textLength += getTextWidth(legend, "1.4em Roboto");
		}
		
		d3.select(root).append("hr");
		
		// Function to draw the pedigree of exactly one family using their virtuel positions
		function drawSinglePedigree(roots, subFamilyDrawInfos, allNodes) { 
			// Start drawing the pedigree
			var svg = d3.select(root).append("svg");
			var container = svg.attr("id", "pedSVG").attr("width", 1920).attr("height", (roots[0].generation+1)*drawMinDistanceY).attr("class", "canRemove");

			// Init tooltip for nodes
			var tooltip = d3.tip().attr("class", "d3-tip").offset([0,0]).html(function(d) {
				var text = "<span>Patient: " + d.SubjectId + "</br>";
				if (d.mother) text += "Mother: " + d.mother.SubjectId + "</br>";
				if (d.father) text += "Father: " + d.father.SubjectId + "</br>";
				text += "</br>";
				if (d.Age) text += "Age: " + d.Age + "</br>";
				if (d.Sex) text += "Sex: " + d.Sex;
				text += "</br>";
				var o = d.original? d.original : d;
				for (var j = 0; j < affectionsNumber; j++) {
					if (o[affections[j]] != "") text += affections[j] + ": " + o[affections[j]] + "</br>";
				}
				text += "</br>";
				for (var j = 0; j < textNodeNumber; j++) {
					text += textNodes[j] + ": " + o[textNodes[j]] + "</br>";
				}
				text += "</span>";
				return text;
			});
			  
			svg.call(tooltip);
			  
			// Draw Nodes
			// Simple switch case over possible shapes, using the constant draw-values to define their positions and sizes
			function drawNode(node, drawValue) {
				if (node == null || node.drawn >= drawValue) return;
				
				var familyDrawInfo = subFamilyDrawInfos[node.subFamilyId];
				var frame = container.append("g").attr("x", familyDrawInfo.startX+node.position.x*drawMinDistance).attr("y", drawPaddingTop+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY);
			  
				var shape;
				if (node.Sex == "female") {
					shape = frame.append("circle").attr("cx", familyDrawInfo.startX+node.position.x*drawMinDistance + drawHalfSize).attr("cy", drawPaddingTop+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY + drawHalfSize).attr("r", drawHalfSize); 
				} else if (node.Sex == "male") {
					shape = frame.append("rect").attr("x", familyDrawInfo.startX+node.position.x*drawMinDistance).attr("y", drawPaddingTop+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY).attr("width", drawSizeOfCell).attr("height", drawSizeOfCell);
				} else {
					shape = frame.append("polygon").attr("points",
						(familyDrawInfo.startX+node.position.x*drawMinDistance) + "," + (drawPaddingTop+drawHalfSize+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY) + "," +
						(familyDrawInfo.startX+drawHalfSize+node.position.x*drawMinDistance) + "," + (drawPaddingTop+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY) + "," +
						(familyDrawInfo.startX+drawSizeOfCell+node.position.x*drawMinDistance) + "," + (drawPaddingTop+drawHalfSize+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY) + "," +
						(familyDrawInfo.startX+drawHalfSize+node.position.x*drawMinDistance) + "," + (drawPaddingTop+drawSizeOfCell+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY)
					);
				}
				
				// Check if node is a clone, needed to access node-data correctly
				var dataNode = node.original? node.original : node;
				
				// Draw affection values if there are any. 
				if (hasAffections) {
					for (var v = 0; v < affectionsNumber; v++) {
						
						if (dataNode[affections[v]] != "") {
					
							// switch case:
							// First check for sex/shape
							// Second check for amount of affections requested
							// For one: set fill-value of shape with css-class
							// For two and more:
							// - Create an arc with 90/180 degree [if female] and color it using a css-class
							// - Create multiple smaller shapes [if male or unknwon] and color them using css-classes; center them inside the real shape
							if (affectionsNumber == 1) { shape.attr("class", "affected"); }
							
							else {
								shape.attr("class", "unaffected");
								
								if (node.Sex == "female") {
									var arcLength = (360/affectionsNumber);
									
									var arc = d3.svg.arc()
									.innerRadius(0)
									.outerRadius(drawHalfSize)
									.startAngle((arcLength * (v-1)) * (Math.PI/180))
									.endAngle((arcLength * v)  * (Math.PI/180));
									
									frame.append("path").attr("d", arc).attr("transform", "translate(" + (familyDrawInfo.startX+node.position.x*drawMinDistance + drawHalfSize) + "," + (drawPaddingTop+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY + drawHalfSize) + ")").attr("class", "affected"+v);
								} else if (node.Sex == "male") {
									var isLeft = v%2 == 0;
									var isTop = v < 2;
									var drawHeight = affectionsNumber > 2 ? drawSizeOfCell/2 : drawSizeOfCell;
									
									frame.append("rect")
									.attr("x", familyDrawInfo.startX+node.position.x*drawMinDistance + (isLeft? 1 : drawHalfSize))
									.attr("y", drawPaddingTop+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY + (isTop? 1 : drawHalfSize))
									.attr("width", drawHalfSize - 1)
									.attr("height", drawHeight - 1)
									.attr("class", "affected"+v);
								} else {
									var pointArray = [
										{x: familyDrawInfo.startX+node.position.x*drawMinDistance + 2, y: drawPaddingTop+drawHalfSize+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY},
										{x: familyDrawInfo.startX+drawHalfSize+node.position.x*drawMinDistance, y: drawPaddingTop+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY + 2},
										{x: familyDrawInfo.startX+drawSizeOfCell+node.position.x*drawMinDistance - 2, y: drawPaddingTop+drawHalfSize+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY},
										{x: familyDrawInfo.startX+drawHalfSize+node.position.x*drawMinDistance, y: drawPaddingTop+drawSizeOfCell+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY - 2},
										{x: familyDrawInfo.startX+drawHalfSize+node.position.x*drawMinDistance, y: drawPaddingTop+drawHalfSize+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY}
									]
									
									if (affectionsNumber < 3) {
										frame.append("polygon").attr("points",
										pointArray[0+v].x + "," + pointArray[0+v].y + "," +
										pointArray[1+v].x + "," + pointArray[1+v].y + "," +
										pointArray[3].x + "," + pointArray[3].y)
										.attr("class", "affected"+v);
									} else {
										frame.append("polygon").attr("points",
										pointArray[0+v].x + "," + pointArray[0+v].y + "," +
										pointArray[(1+v)%4].x + "," + pointArray[(1+v)%4].y + "," +
										pointArray[4].x + "," + pointArray[4].y)
										.attr("class", "affected"+v);
									}
								}
								
								//Move actual frame to front to ensure borders are all the same size
								shape[0][0].parentNode.appendChild(shape[0][0]);
								
							}
						} else {
							shape.attr("class", "unaffected");
						}
					}
				} else {
					shape.attr("class", unaffected);
				}
				
				// Add text below the shape (if there is any) by adding it to the frame of the shape
				if (hasTextNodes) {
					var currY = 0;
					for (var j = 0; j < textNodeNumber; j++) {
						var currentText = dataNode[textNodes[j]];
						if (currentText == "") continue;
						frame.append("text")
						.attr("text-anchor", "middle")
						.attr("dx", familyDrawInfo.startX+node.position.x*drawMinDistance+drawHalfSize)
						.attr("dy", drawPaddingTop+(node.position.y-familyDrawInfo.minY)*drawMinDistanceY + drawSizeOfCell + 15 + currY)
						.attr("class", "textNode")
						.text(textNodes[j] + ": " + currentText);
						currY += 15;
					}
				}
				 
				// Add the tooltip for the subject to the frame of the shape
				shape.on("mouseover", function(d) { tooltip.show(node, shape) });
				shape.on("mouseout", tooltip.hide);
				
				// Save that this node was drawn
				node.drawn = drawValue;
				
				// Draw spouses and siblings
				for (var v = 0; v < node.childrenWith.length; v++) {
					var spouseNode = node.childrenWith[v];
					drawNode(spouseNode, drawValue);
					for (var w = 0; w < node.sortedChildren[spouseNode.SubjectId].length; w++) {
						drawNode(node.sortedChildren[spouseNode.SubjectId][w], drawValue);
					}
				}
			}
			
			var dv = roots[0].drawn;
			if (dv == null) { dv = 1; } else { dv++; }
			for (var i = 0; i < roots.length; i++) {
				drawNode(roots[i], dv);
			}
			
			
			// DRAW LINES
			// Function to draw a line between two points
			function drawSingleLine(x1, y1, x2, y2) {
				if (x1 == x2 && y1 == y2) return;
			  
				container.append("line")
				.attr("x1", x1)
				.attr("y1", y1)
				.attr("x2", x2)
				.attr("y2", y2)
				.attr("stroke", "black")
				.attr("stroke-width", 4);
			}
			  
			/*
			Begin with root.
			Draw to all CONNECTED spouse nodes.
			Take the midpoint betwenn them to draw half-way to child level
			draw one line from minChildX to maxChildX.
			for every child with this spouse:
			Draw an line upwards to half-way to parent-level
			  
			Rinse and repeat for every children and spouse!
			*/
			function drawLines(node, drawValue) {
				if (node.position.linesDrawn >= drawValue) return;
				
				for (var v = 0; v < node.childrenWith.length; v++) {
					var partner = node.childrenWith[v];
					
					if (partner.position.linesDrawn >= drawValue) continue;
					var familyDrawInfo = subFamilyDrawInfos[node.subFamilyId];
				
					var midY = (node.position.y-familyDrawInfo.minY) * drawMinDistanceY + drawPaddingTop + drawHalfSize;
					var leftX, rightX;
					
					// Partner is right to the node
					if (partner.position.x > node.position.x) {
						leftX = node.position.x * drawMinDistance + familyDrawInfo.startX + drawSizeOfCell;
						rightX = partner.position.x * drawMinDistance + familyDrawInfo.startX;
					} else { // Partner is left to the node
						leftX = partner.position.x * drawMinDistance + familyDrawInfo.startX + drawSizeOfCell;
						rightX = node.position.x * drawMinDistance + familyDrawInfo.startX;
					}
					
					var canvas = container[node.subFamilyId];
					
					// Draw partner line
					drawSingleLine(leftX, midY, rightX, midY);
					
					// Draw children line
					var childY = (node.position.y - familyDrawInfo.minY + 0.68) * drawMinDistanceY + drawPaddingTop;
					var childs = node.sortedChildren[partner.SubjectId];
					drawSingleLine(childs[0].position.x * drawMinDistance + drawHalfSize + familyDrawInfo.startX, childY, childs[childs.length-1].position.x * drawMinDistance + drawHalfSize + familyDrawInfo.startX, childY);
					
					//Draw ParentLine-ChildrenLine Connector
					var midPoint = (leftX + rightX)/2;
					drawSingleLine(midPoint, midY, midPoint, childY);
					
					//Draw ChildrenLine-Child Connector
					var lowChildY = (childs[0].position.y-familyDrawInfo.minY) * drawMinDistanceY + drawPaddingTop;
					for (var w = 0; w < childs.length; w++) {
						var lowChildX = childs[w].position.x * drawMinDistance + drawHalfSize + familyDrawInfo.startX;
						drawSingleLine(lowChildX, lowChildY, lowChildX, childY - 2); //-2: StrokeWidth is 4. childY draw a line to the mid. we need to go a bit higher or we'll have clunky egdes;
					}
				}
				
				// Draw curved line to original node if this one is a copy
				// Adapted: https://stackoverflow.com/questions/25595387/d3-js-how-to-convert-edges-from-lines-to-curved-paths-in-a-network-visualizatio
				if (node.original != null) {
					var copyDrawInfo = subFamilyDrawInfos[node.subFamilyId];
					var orgDrawInfo = subFamilyDrawInfos[node.original.subFamilyId];
					
					var start = { "x": orgDrawInfo.startX + drawHalfSize + node.original.position.x * drawMinDistance,
								  "y": (node.original.position.y-orgDrawInfo.minY) * drawMinDistanceY + drawPaddingTop}
					var end = { "x": copyDrawInfo.startX + drawHalfSize + node.position.x * drawMinDistance,
								"y": (node.position.y-copyDrawInfo.minY) * drawMinDistanceY + drawPaddingTop}
					
					var mid = { "x": start.x + (end.x - start.x)/2, "y": start.y + (end.y - start.y)/2 };
					var xLine = end.x - start.x;
					var yLine = end.y - start.y;
					var xSign = xLine < 0 ? -1 : 1;
					var ySign = yLine < 0 ? -1 : 1;
					
					var theta = Math.atan(yLine / xLine);
					var cosTheta = xSign * Math.cos(theta);
					var sinTheta = xSign * Math.sin(theta);
					
					var curvedMidX = -120 * sinTheta;
					var curvedMidY = -120 * cosTheta;
					
					var curvedMid = { "x": mid.x - curvedMidX, "y": mid.y + curvedMidY };
					
					container.append("svg:path").attr("class", "link").attr("d", "M"+start.x+","+start.y+"Q"+curvedMid.x+","+curvedMid.y+" "+end.x+","+end.y).attr("stroke", "black").attr("stroke-width", 2).style("stroke-dasharray", ("10, 9"));
					
				}
				
				node.position.linesDrawn = drawValue;
			
				for (var v in node.sortedChildren) {
					for (var w = 0; w < node.sortedChildren[v].length; w++) {
						drawLines(node.sortedChildren[v][w]);
					}
				}
			}
			  
			for (var i = 0; i < roots.length; i++) {
				drawLines(roots[i], dv);
			}
			
			// Draw allelFrequency
			var tableData = "<div class='dataTable'><table><th>SNP</th><th>A1</th><th>A2</th><th>MAF</th><th>C1</th><th>C2</th><th>NCHROBS</th><th>G0</th>";
			for (var i = 0; i < window.pedigreeGlobal.allelFrequency.length; i++) {
				tableData += "<tr>";
				
				var allelFreq = window.pedigreeGlobal.allelFrequency[i];
				for (var j = 0; j < allelFreq.length; j++) {
					tableData += "<td>" +  allelFreq[j] + "</td>";
				}
				
				tableData += "</tr>";
			}
			tableData += "</table></div>";
			
			// Draw HWE
			tableData += "<div class='dataTable'><table><th>SNP</th><th>TEST</th><th>A1</th><th>A2</th><th>GENO</th><th>O(HET)</th><th>E(HET)</th>";
			for (var i = 0; i < window.pedigreeGlobal.hwe.length; i++) {
				tableData += "<tr>";
				
				var hweRow = window.pedigreeGlobal.hwe[i];
				for (var j = 0; j < hweRow.length; j++) {
					tableData += "<td>" +  hweRow[j] + "</td>";
				}
				
				tableData += "</tr>";
			}
			tableData += "</table></div>";
			
			// Draw unrelated
			tableData += "<div class='dataTable'><table><tr><th>Maximal unrelated individuals</th></tr><tr><td>";
			var unrelatedFam = window.pedigreeGlobal.unrelated[window.pedigreeGlobal.currentPedIndex];
			for (var i = 0; i < unrelatedFam.length; i++) {
				tableData += unrelatedFam[i] + (i+1 != unrelatedFam.length? ", ": "</td></tr></table></div>");
			} 
			
			// Draw Kinship Table
			tableData += "<div class='dataTable'><table><th></th>";
			
			for (var i = 0; i < allNodes.length; i++) {
				tableData += "<th>" + allNodes[i].SubjectId + "</th>";
			}
			
			var kinship = window.pedigreeGlobal.kinship[window.pedigreeGlobal.currentPedIndex];
			for (var i = 0; i < kinship.length; i++) {
				tableData += "<tr>";
				var kinshipRow = kinship[i];
			
				for (var j = -1; j < kinshipRow.length; j++) {
					if (j == -1) {
						tableData += "<td class='headerColumn'>" + allNodes[i].SubjectId + "</td>";
					} else {
						tableData += "<td>" + kinshipRow[j] + "</td>";
					}
				}
				tableData += "</tr>";
			}
			tableData += "</table></div>";

			// Append all table to dataDiv
			d3.select(root).append("div").attr("class", "canRemove").attr("id", "dataTables");
			document.getElementById("dataTables").innerHTML = tableData;
		}

		// Define the button functions to view the previous/next pedigree
		window.prevPedigreeFct = function() {
			window.pedigreeGlobal.prevPed.attr("disabled", "disabled");
			window.pedigreeGlobal.nextPed.attr("disabled", "disabled");
			window.pedigreeGlobal.currentPedIndex--;
			removePlot();
			famText.text("Family Id: " + window.pedigreeGlobal.pedDataKeys[window.pedigreeGlobal.currentPedIndex]);
			var famData = window.pedigreeGlobal.pedDataPerFamily[window.pedigreeGlobal.pedDataKeys[window.pedigreeGlobal.currentPedIndex]];
			drawSinglePedigree(famData.roots, famData.subFamilyDrawInfos, famData.data);
			window.pedigreeGlobal.nextPed.attr("disabled", null);
			if (window.pedigreeGlobal.currentPedIndex > 0) window.pedigreeGlobal.prevPed.attr("disabled", null);
		}

		window.nextPedigreeFct = function() {
			window.pedigreeGlobal.prevPed.attr("disabled", "disabled");
			window.pedigreeGlobal.nextPed.attr("disabled", "disabled");
			window.pedigreeGlobal.currentPedIndex++;
			famText.text("Family Id: " + window.pedigreeGlobal.pedDataKeys[window.pedigreeGlobal.currentPedIndex]);
			var famData = window.pedigreeGlobal.pedDataPerFamily[window.pedigreeGlobal.pedDataKeys[window.pedigreeGlobal.currentPedIndex]];
			removePlot();
			drawSinglePedigree(famData.roots, famData.subFamilyDrawInfos, famData.data);
			window.pedigreeGlobal.prevPed.attr("disabled", null);
			if (window.pedigreeGlobal.currentPedIndex < window.pedigreeGlobal.pedDataKeys.length-1) window.pedigreeGlobal.nextPed.attr("disabled", null);
		}

		prevPed.text("Previous Pedigree");
		prevPed.attr("onclick", "window.prevPedigreeFct()");
		nextPed.text("Next Pedigree");
		nextPed.attr("onclick", "window.nextPedigreeFct()");

		// Define the first pedigree to be drawn and draw it
		var firstPed = window.pedigreeGlobal.pedDataPerFamily[window.pedigreeGlobal.pedDataKeys[0]];
		drawSinglePedigree(firstPed.roots, firstPed.subFamilyDrawInfos, firstPed.data);
		
		//// UTILITY FUNCTIONS ////
		
		// Textwidth of any given text
		function getTextWidth(text, font) {
			var canvas = document.createElement("canvas");
			var context = canvas.getContext("2d");
			context.font = font;
			var metrics = context.measureText(text);
			return metrics.width;
		}
		
	    // Removes the plot at wish
            function removePlot() {
                //d3.select(root).selectAll('svg').remove();
                d3.selectAll('.canRemove').remove();
				d3.selectAll('.d3-tip').remove();
            }
        }
    }]);
