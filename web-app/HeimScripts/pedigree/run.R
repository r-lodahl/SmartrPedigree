library(jsonlite)
library(plyr)
library(tidyr)
library(reshape2)
library(kinship2)
library(rlist)

main <- function() {
	tmp.names <- fetch_params
	
    tmp.format1 <- unlist(loaded_variables, recursive = FALSE)
    tmp.format1 <- as.data.frame(tmp.format1)

    tmp.delColumns <- grep("Row.Label", colnames(tmp.format1))
    tmp.delColumns <- tmp.delColumns[2:length(tmp.delColumns)]
    tmp.format2 <- tmp.format1[,-tmp.delColumns]

    number <- length(tmp.names$ontologyTerms)

	tmp.nameList = character(number)
	tmp.keyList = character(number)
	for (i in 1:number) {
		tmp.subIndex <- gregexpr(pattern = "\\\\", tmp.names$ontologyTerms[[i]]$key)[[1]]
		tmp.subLength <- length(tmp.subIndex)
		
		tmp.malus <- 0;
		if (is.null(tmp.names$ontologyTerms[[i]]$metadata$unitValues$normalUnits)) {tmp.malus <- 1}
		
		tmp.nameList[i] <- substr(tmp.names$ontologyTerms[[i]]$key, tmp.subIndex[tmp.subLength-1-tmp.malus]+1, tmp.subIndex[tmp.subLength-tmp.malus]-1)
		tmp.keyList[i] <- substr(tmp.names$ontologyTerms[[i]]$key, tmp.subIndex[3], tmp.subIndex[tmp.subLength-1])
	}
	tmp.nameList <- unique(tmp.nameList);
	tmp.keyList <- unique(tmp.keyList)
	
	## Format to tmp.format2 design
	tmp.keyList <- gsub(" ", ".", tmp.keyList)
	tmp.keyList <- gsub("\\(", ".", tmp.keyList)
	tmp.keyList <- gsub("\\)", ".", tmp.keyList)
	tmp.keyList <- gsub("-", ".", tmp.keyList)
	tmp.keyList <- gsub("\\/", ".", tmp.keyList)
	tmp.keyList <- gsub("\\\\", ".", tmp.keyList)
	
	colnames(tmp.format2)[1] <- "internalId"
	
	tmp.affection <- character()
	tmp.textNodes <- character()
	for (i in 1:length(tmp.keyList)) {
		tmp.currentCols <- grep(tmp.keyList[i], colnames(tmp.format2))
		tmp.format2[,tmp.currentCols[1]] <- as.character(tmp.format2[,tmp.currentCols[1]])
		
		if (length(tmp.currentCols) > 1) {	
			for (idx in tmp.currentCols[2:length(tmp.currentCols)]) {
				tmp.format2[,tmp.currentCols[1]] <- ifelse(is.na(tmp.format2[,tmp.currentCols[1]]) | tmp.format2[,tmp.currentCols[1]] == "", as.character(tmp.format2[,idx]), tmp.format2[,tmp.currentCols[1]])
			}

			tmp.format2 <- tmp.format2[,-tmp.currentCols[2:length(tmp.currentCols)]]
		}
		
		
		tmp.isCore <- TRUE
		if (grepl("affectionStatus", colnames(tmp.format2)[tmp.currentCols[1]])) {
			tmp.affection <- c(tmp.affection, tmp.nameList[i])
			tmp.isCore <- FALSE
		}
		
		if ((grepl("additionalCategoric", colnames(tmp.format2)[tmp.currentCols[1]]) && 
			tmp.nameList[i] != "Sex") ||
			grepl("additionalNumeric", colnames(tmp.format2)[tmp.currentCols[1]])) {
			tmp.textNodes <- c(tmp.textNodes, tmp.nameList[i])
			tmp.isCore <- FALSE
		}
		
		if (tmp.isCore) {
			colnames(tmp.format2)[tmp.currentCols[1]] <- gsub(" ", "", tmp.nameList[i])
		} else {
			colnames(tmp.format2)[tmp.currentCols[1]] <- tmp.nameList[i]
		}
	}
	
	## Sample Analyses ##
	kinshipFrame <- createKinshipFrame(tmp.format2)
	kinshipPed <- pedigree(id=kinshipFrame$id, dadid=kinshipFrame$father, momid=kinshipFrame$mother, sex=kinshipFrame$sex, famid=kinshipFrame$ped)
	
	# Kinship2 Analyses
	tmp.kinList <- list()
	tmp.unrelated <- list()
	tmp.families <- unique(kinshipFrame$ped)
	for (i in 1:length(tmp.families)) {
		tmp.kinList <- list.append(tmp.kinList,kinship(kinshipPed[tmp.families[i]]))
		tmp.unrelated <- list.append(tmp.unrelated, pedigree.unrelated(kinshipPed[tmp.families[i]], rep(TRUE, length(kinshipFrame$ped[kinshipFrame$ped == tmp.families[i]]))))
	}
	
	# Get founders for some basic analyses
	tmp.founders <- tmp.format2[tmp.format2$MaternalId == "None" & tmp.format2$PaternalId == "None",]
	
	# Calculate allele frequency
	tmp.allelNodes <- tmp.textNodes[startsWith(tmp.textNodes, "rs")]
	tmp.freqHweAll <- getFreqAndHwe(tmp.allelNodes, tmp.founders)
	tmp.allelFreqMatrix <- tmp.freqHweAll[[1]]

	# Calculate Hardy-Weinberg-Equilibrium for Affections
	tmp.hweMatrix <- tmp.freqHweAll[[2]]
	for (i in 1:length(tmp.affection)) {
		tmp.freqHweAff <- getFreqAndHwe(tmp.allelNodes, tmp.founders, status=tmp.affection[i], notAffected=FALSE)[[2]]
		tmp.freqHweUnaff <- getFreqAndHwe(tmp.allelNodes, tmp.founders, status=tmp.affection[i], notAffected=TRUE)[[2]]
		tmp.hweMatrix <- rbind(tmp.hweMatrix, tmp.freqHweAff)
		tmp.hweMatrix <- rbind(tmp.hweMatrix, tmp.freqHweUnaff)
	}
	
	##############################
	## ## Create output file ## ## 
	##############################
	pedOut <- list(tmp.format2, tmp.affection, tmp.textNodes, tmp.kinList, tmp.unrelated, tmp.allelFreqMatrix, tmp.hweMatrix)
	names(pedOut) <- c("pedData", "affectionData", "textData", "kinship", "maxUnrelated", "allelFrequency", "hwe")
	
    # Output to client JS
    toJSON(pedOut)
}

getFreqAndHwe <- function(allelNodes, founders, status="", notAffected=FALSE) {
	
	# for allele frequency
	allelFreqMatrix <- matrix(0, ncol=8, nrow=length(allelNodes))
	colnames(allelFreqMatrix) <- c("SNP", "A1", "A2", "MAF", "C1", "C2", "NCHROBS", "G0")
	
	# for Hardy-Weinberg-Equilibrium
	hweMatrix <- matrix(0, ncol=7, nrow=length(allelNodes))
	colnames(hweMatrix) <- c("SNP", "TEST", "A1", "A2", "GENO", "O(HET)", "E(HET)")
	
	for (i in 1:length(allelNodes)) {
		
		if (status == "") {
			counts <- table(founders[allelNodes[i]])
		} else if (notAffected) {
			counts <- table(founders[founders[status] == "",][allelNodes[i]])
		} else {
			counts <- table(founders[founders[status] != "",][allelNodes[i]])
		}
		relevantContent <- gsub(" |0", "", paste(names(counts), collapse=""))

		## We need to skip if we got no data or just 0 0 data
		if (nrow(counts) > 0 & relevantContent != "") {
			chars <- unique(strsplit(relevantContent, "")[[1]])
			allelCounts <- matrix(0, ncol=length(chars), nrow=1)
			colnames(allelCounts) <- chars
			
			for (j in 1:length(chars)) {
				firstAllelCount <- sum(counts[startsWith(names(counts),chars[j])])
				secondAllelCount <- sum(counts[endsWith(names(counts), chars[j])])
				
				firstAllelCount <- ifelse(is.na(firstAllelCount), 0, firstAllelCount)
				secondAllelCount <- ifelse(is.na(secondAllelCount), 0, secondAllelCount)
				
				allelCounts[j] <- firstAllelCount + secondAllelCount
			}
			
			## Check for edge cases: only one char found
			if (length(allelCounts) > 1) { 
				maxes <- maxIndexRanking(allelCounts)
				a1 <- allelCounts[maxes[[2]]]
				a2 <- allelCounts[maxes[[1]]]
				nchrobs <- a1+a2
				maf <- a1 / nchrobs
				a2name <- colnames(allelCounts)[maxes[[2]]]
			} else {
				a1 <- 0
				a2 <- allelCounts[1]
				nchrobs <- a1
				maf <- 0
				a2name <- "-"
			}
			
			error <- sum(allelCounts) + 2 * counts["0 0"] - nchrobs
			
			allelFreqMatrix[i, 1] <- allelNodes[i]
			allelFreqMatrix[i, 2] <- a2name
			allelFreqMatrix[i, 3] <- colnames(allelCounts)[maxes[[1]]]
			allelFreqMatrix[i, 4] <- maf
			allelFreqMatrix[i, 5] <- a1
			allelFreqMatrix[i, 6] <- a2
			allelFreqMatrix[i, 7] <- nchrobs
			allelFreqMatrix[i, 8] <- error
			
			# Calculate Hardy-Weinberg-Equilibrium for THIS
			countaa <- counts[paste(allelFreqMatrix[i,2], allelFreqMatrix[i,2], sep=" ")]
			countAA <- counts[paste(allelFreqMatrix[i,3], allelFreqMatrix[i,3], sep=" ")]
			countAa <- counts[paste(allelFreqMatrix[i,3], allelFreqMatrix[i,2], sep=" ")]
			countaA <- counts[paste(allelFreqMatrix[i,2], allelFreqMatrix[i,3], sep=" ")]
			
			countaa <- ifelse(is.na(countaa), 0, countaa)
			countAA <- ifelse(is.na(countAA), 0, countAA)
			countAa <- ifelse(is.na(countAa), 0, countAa)
			countaA <- ifelse(is.na(countaA), 0, countaA)
			countAaaA <- countAa + countaA
			
			ohet <- countAaaA / (countAaaA + countAA + countaa)
			ehet <- 2 * (maf * (1-maf))
			
			geno <- paste(countaa, "/", countAaaA, "/", countAA, sep="")
			
			hweMatrix[i, 1] <- allelNodes[i]
			hweMatrix[i, 2] <- ifelse(status == "", "ALL", ifelse(notAffected, paste("UNAFF", status, sep=" "), paste("AFF", status, sep=" ")))
			hweMatrix[i, 3] <- allelFreqMatrix[i, 2]
			hweMatrix[i, 4] <- allelFreqMatrix[i, 3]
			hweMatrix[i, 5] <- geno
			hweMatrix[i, 6] <- ohet
			hweMatrix[i, 7] <- ehet
		} else {
			allelFreqMatrix[i, 1] <- allelNodes[i]
			allelFreqMatrix[i, 2] <- "0"
			allelFreqMatrix[i, 3] <- "0"
			allelFreqMatrix[i, 4] <- "0"
			allelFreqMatrix[i, 5] <- "0"
			allelFreqMatrix[i, 6] <- "0"
			allelFreqMatrix[i, 7] <- "0"
			allelFreqMatrix[i, 8] <- "0"
			hweMatrix[i, 1] <- allelNodes[i]
			hweMatrix[i, 2] <- ifelse(status == "", "ALL", ifelse(notAffected, paste("UNAFF", status, sep=" "), paste("AFF", status, sep=" ")))
			hweMatrix[i, 3] <- "0"
			hweMatrix[i, 4] <- "0"
			hweMatrix[i, 5] <- "0/0/0"
			hweMatrix[i, 6] <- "0"
			hweMatrix[i, 7] <- "0"
		}
	}
	return(list(allelFreqMatrix,hweMatrix))
}


createKinshipFrame <- function(formatted) {
	## Rebuild PED for analysis
	anaSex <- formatted$Sex
	if (is.null(anaSex)) {
		anaSex <- rep("unknown", length(formatted$SubjectId))
	}
	
	anaPed <- data.frame(formatted$FamilyId,formatted$SubjectId,formatted$PaternalId,formatted$MaternalId,anaSex,integer(length(formatted$FamilyId)))
	colnames(anaPed) <- c("ped", "id", "father", "mother", "sex", "affected")
	anaPed$ped <- as.character(anaPed$ped)
	anaPed$id <- as.character(anaPed$id)
	anaPed$father <- as.character(anaPed$father)
	anaPed$mother <- as.character(anaPed$mother)
	anaPed$sex <- as.character(anaPed$sex)
	
	anaPed$sex[anaPed$sex == "male"] <- 1
	anaPed$sex[anaPed$sex == "female"] <- 2
	anaPed$sex[anaPed$sex == "unknown"] <- 3
	anaPed$sex <- as.integer(anaPed$sex)
	
	anaPed$mother[anaPed$mother == "None"] <- NA
	anaPed$father[anaPed$father == "None"] <- NA
	
	return(anaPed)
}

maxIndexRanking <- function(x){
	maxIdx <- which.max(x)
	max2Idx <- which(x == max(x[-maxIdx]))
	if (length(max2Idx) > 1) {
		max2Idx <- max2Idx[max2Idx != maxIdx]
		max2Idx <- max2Idx[1]
	}
	return(list(maxIdx,max2Idx))
}