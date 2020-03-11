﻿const fs = require('fs');
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

//global variables
var lastAbsolute = 0;
var desiredRatio = 1;
var inFile = "in.wav";
var outFile = "out.wav";
var ruleFile = "rule.txt";
var holdRules;

if(process.argv[2]!==undefined){inFile = process.argv[2];}
if(process.argv[3]!==undefined){ruleFile = process.argv[3];}
if(process.argv[4]!==undefined){outFile = process.argv[4];}

function log(text){
	console.log(text);
}

Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
}; //thank you, https://web.archive.org/web/20090717035140if_/javascript.about.com/od/problemsolving/a/modulobug.htm

Array.prototype.insert = function(index, inary) {
	while(inary.length){this.splice(++index, 0, inary.shift());}
}; //thank you, https://web.archive.org/web/20090717035140if_/javascript.about.com/od/problemsolving/a/modulobug.htm

Array.prototype.replace = function(index, length, inary) {
	var ret = this.splice(index, length); //delete
	while(inary.length){this.splice(++index, 0, inary.shift());}
	return ret; //you might want to keep what you deleted
}; //thank you, https://web.archive.org/web/20090717035140if_/javascript.about.com/od/problemsolving/a/modulobug.htm

function round(num){//just makes things easier
	return Math.round(num);
};

function fileToUint8Array(path){
	var retdat;
	retdat = Uint8Array.from(fs.readFileSync(path));
	return retdat;
};

function splitUint8Array(array,pos){
	var ret = [new Uint8Array(pos), new Uint8Array(array.length-pos)];//set up arrays to be returned
	for(var i = 0; i<pos;i++){
		ret[0][i] = array[i];
	}
	for(var i = pos; i<array.length;i++){
		ret[1][i-pos] = array[i];
	}
	return ret;
};

function templateStringToSkipRule(inTemplate){
	var holdTokens = inTemplate.replace(/-| |\r|\t/g,'').replace(/█/g,":").split(":");//remove all white spaces, dashes, and newlines and split by colons
	var holdRule = {
		flag:false,
		iFlag:false,
		repeat:1,
		factor:1,
		sampleTime:0,
		playTime:0,
		origin:-1,
		offset:0,
		desiredRatio:0,
		samples:[],
		pattern:"F"
	};
	var holdArgs, holdLength, holdPattern;
	for(var i = 0; i<holdTokens.length; i++){
		switch(holdTokens[i].charAt(0).toLowerCase()){
			case 's':
				holdArgs = holdTokens[i].substr(1).split(","); //remove first "S" and split by commas
				if(holdArgs[1]==undefined) holdArgs[1]="F";
				holdLength = parseFloat("0"+holdArgs[0]);
				holdLength *= holdRule.sampleTime;
				holdRule.samples.push([holdLength,holdArgs[1],holdArgs[1].toLowerCase()]);//get the sample length (in seconds), forward character, and backwards character
			break;
			case 'r'://repeat
				holdRule.repeat = parseInt("0"+holdTokens[i].substr(1));
			break;
			case 'f'://factor/frequency
				holdRule.factor = parseInt("0"+holdTokens[i].substr(1));
			break;
			case 'l'://sample length
				holdRule.sampleTime = parseFloat("0"+holdTokens[i].substr(1));
			break;
			case 'o'://offset (from last origin)
				holdRule.offset = parseFloat("0"+holdTokens[i].substr(1));
			break;
			case 'a'://absolute origin/align
				holdRule.origin = parseFloat("0"+holdTokens[i].substr(1));
			break;
			case 'm'://multiplier
				holdRule.sampleTime *= parseFloat("0"+holdTokens[i].substr(1));
			break;
			case 't'://sample/playback time ratio
				holdRule.desiredRatio = parseFloat("0"+holdTokens[i].substr(1));
			break;
			case 'x'://flag
				holdRule.flag = true;
			break;
			case 'i'://interval flag
				holdRule.iFlag = true;
			break;
			case 'p'://pattern
				holdRule.pattern = holdTokens[i].substr(1);//remove first char from token
			break;
		}
	}
	var holdPattern = holdRule.pattern.split("");
	var holdSymbol;
	while(holdPattern.length){
		holdSymbol = holdPattern.pop();
		for(var q = 0; q<holdRule.samples.length; q++){
			if(holdSymbol==holdRule.samples[q][1]||holdSymbol==holdRule.samples[q][2]){//counting every occurrence of this symbol in this pattern
				holdRule.playTime+=holdRule.samples[q][0]/holdRule.factor;//get the speed of the microsample
			}
		}
	}
	if(holdRule.samples.length==0){
		holdRule.samples[0] = [0,"f","r"]; //put in a sample that takes no space for empty lines
		holdRule.repeat = 0;
		holdRule.playTime = 0;
		holdRule.sampleTime = 0;
	}
	return holdRule;
}

function ruleListFromFile(path){
	var holdRules = fs.readFileSync(path,"utf8").split("\n");
	var ret = [];
	var holdRule;
	//log("[//RULES LIST\\\\]{");
	for(var i = 0; i<holdRules.length; i++){
		//log("  "+holdRules[i]);
		holdRule = holdRules[i].split("/")[0];
		if(holdRule == "") continue; //useless if it's empty
		if(holdRule.toLowerCase().indexOf("eof")!==-1) break; //end of file
		//log(templateStringToSkipRule(holdRule));
		ret.push(templateStringToSkipRule(holdRule));
	}
	//log("}");
	return ret;
}

function skipjackWholeTrack(inTrack, outTrack, ruleList, offset){
	if(typeof offset !== 'number') offset = 0;
	var totalTime = 0;
	log("");
	for(var rep = 0; rep < ruleList.length; rep++){
		if(ruleList[rep].repeat==0) continue; //don't waste time processing it if its empty
		if(ruleList[rep].origin >= 0){
			lastAbsolute = ruleList[rep].origin;
			offset = ruleList[rep].offset+lastAbsolute;
		}
		if(ruleList[rep].offset > 0) offset = ruleList[rep].offset+lastAbsolute;
		if(ruleList[rep].desiredRatio>0) desiredRatio = ruleList[rep].desiredRatio;
		
		log(">Skipjacking @"+round(offset*100)/100+"sec for "+ruleList[rep].repeat+" reps w/ pattern \'"+ruleList[rep].pattern+"\' for "+round(ruleList[rep].repeat*ruleList[rep].playTime*100)/100+" seconds");
		if(round((ruleList[rep].playTime/ruleList[rep].sampleTime)*100)/100 !== desiredRatio && ruleList[rep].playTime > 0) log("!WARNING: sample/playback time ratio does not match desired ratio\n$       ("+round((ruleList[rep].playTime/ruleList[rep].sampleTime)*100)/100+"/1 vs "+desiredRatio+"/1) This can destroy the track's time signature.");
		outTrack.data = concatSegments(outTrack.data, skipPitchSegment(inTrack, ruleList[rep], offset));
		offset+=ruleList[rep].sampleTime*ruleList[rep].repeat;
		totalTime+=ruleList[rep].playTime*ruleList[rep].repeat;
	}
	log("\n!Done! Final track time is "+round(totalTime*100)/100+" seconds.\n");
}

function skipPitchSegment(track, rule, offset){//track should be a WAVFile class.  Offset measured in seconds
	var ret = [];
	if(rule.flag || rule.iFlag) ret.unshift(99999999,-99999999);
	for(var reps = 0; reps < rule.repeat; reps++){
		var holdSample = speedSegmentStereo(track.getSegment(offset,rule.sampleTime),rule.factor,true); //this gets the sample from the core track and speeds it up by the factor in the rule
		offset+=rule.sampleTime; //advance to the next sample
		var microSamples = [];//all the little bits that get skipped
		var holdPosition = 0;//holds the start position of subsequent microsamples within the sample
		for(var i = 0; i<rule.samples.length; i++){
			microSamples.push({
				sample:getSegmentSection(holdSample, holdPosition/rule.factor,rule.samples[i][0]/rule.factor,track.getSampleRate(),track.getNumChannels()),//samples[n][0] points to length of microsample of nth sample token
				foreChar:rule.samples[i][1],
				backChar:rule.samples[i][2],
			});
			
			holdPosition+=rule.samples[i][0];
		}
		var holdPattern, holdSampleChar;
		
		holdPattern = rule.pattern.split("");
		while(holdPattern.length){
			holdSampleChar = holdPattern.shift();
			for(var i = 0; i<microSamples.length; i++){//search the microSamples for this character
				if(holdSampleChar == microSamples[i].foreChar){//forward microsample
					ret = concatSegments(ret,microSamples[i].sample);
				}
				if(holdSampleChar == microSamples[i].backChar){//backward microsample
					ret = concatSegments(ret,reverseSegment(microSamples[i].sample,track.getNumChannels()));
				}
			}
		}
		if(rule.iFlag) ret.push(99999999,-99999999);
	}
	if(rule.flag) ret.push(99999999,-99999999);
	//console.log(ret);
	return ret;
}

function getSegmentSection(segment, start, length, sampleRate, numChannels){//measured in seconds
	var holdSeg = [];
	start = round((start*sampleRate)/2)*2*numChannels; //div by two to make sure we don't flip L/R channels
	length = round((length*sampleRate)/2)*2*numChannels; //div by two to make sure we don't flip L/R channels
	for(var i = start; i<start+length; i++) holdSeg.push(segment[i]);
	return holdSeg;
}

function reverseSegment(segment, numChannels){
	while(segment.length/numChannels!==round(segment.length/numChannels)) segment.pop() //samples has to be devisable by channels
	var ret = [];
	if(numChannels==2){
		for(var i = segment.length-1; i>=0; i-=2){
			ret.push(segment[i+1]);
			ret.push(segment[i]);
		}
	}else{
		ret = segment.reverse();
	}
	return ret;
}

function speedSegment(segment, factor, smooth){//sets the speed to 1/factor of that of the original
	var ret = [];
	var holdVal = 0;
	for(var i = 0; i<segment.length; i+=factor){
		if(smooth){
			holdVal = 0;
			for(var q = 0; q<factor; q++){
				holdVal+=segment[i+q];
			}
			holdVal/=factor; //average the data points
			ret.push(holdVal);
		}else{
			ret.push(segment[i]);
		}
	}
	return ret;
}

function speedSegmentStereo(segment, factor, smooth){//sets the speed to 1/factor of that of the original
	var ret = [];
	var holdVal = 0;
	for(var i = 0; i<segment.length; i+=factor*2){
		if(smooth){
			holdVal = 0;//right
			for(var q = 0; q<factor*2; q+=2){
				holdVal+=segment[i+q];
			}
			holdVal/=factor; //average the data points
			ret.push(holdVal);
			
			holdVal = 0;//left
			for(var q = 1; q<factor*2; q+=2){
				holdVal+=segment[i+q];
			}
			holdVal/=factor; //average the data points
			ret.push(holdVal);
		}else{
			ret.push(segment[i]);
			ret.push(segment[i+1]);
		}
	}
	return ret;
}

function getNumFromUint8Array(array,pos,bytes,signed,bigEndian){
	var holdNums = [];
	var ret = 0;
	var maxNum = 1;
	for(var i = pos; i<pos+bytes; i++){
		if(i<0||i>=array.length){
			holdNums.push(0);
			continue;
		}
		holdNums.push(array[i]);
	}
	if(signed){
		while(holdNums.length){
			ret = ret*256+holdNums.pop();//shift right (or is it left)
			maxNum *= 256;
		}
		if(ret>=maxNum/2) ret -= maxNum;
	}else{
		while(holdNums.length) ret = ret*256+holdNums.pop();//shift right (or is it left)
	}
	return ret;
};

function setNumInUint8Array(array,value,pos,bytes,bigEndian){
	var holdBytes = [];
	var holdValue = 0;
	var maxVal = 1;
	for(var i = 0; i<bytes; i++) maxVal*=256;
	if(value>maxVal/2) value = maxVal/2;  //these clip the values to ensure no funky business
	if(value<maxVal/-2) value = maxVal/-2;
	if(value<0) value+=maxVal; //this should make it work.  I pray it does
	value = round(value);
	for(var i = 0; i<bytes; i++){
		holdValue = value.mod(256);
		value = (value-holdValue)/256; //step through 8 bits at a time
		holdBytes.push(holdValue);
	}
	while(holdBytes.length){
		if(pos<0||pos>=array.length) break;
		array[pos] = holdBytes.shift();
		pos++;
	}
};

function WAVRawToSampleArray(inData,bytesPerSample){
	var ret = [];
	for(var i = 0; i<inData.length/bytesPerSample; i++){
		ret.push(getNumFromUint8Array(inData,i*bytesPerSample,bytesPerSample,true));
	}
	return ret;
};

function SampleArrayToWAVRaw(inArray,bytesPerSample){
	var ret = new Uint8Array(inArray.length*bytesPerSample);
	for(var i = 0; i<inArray.length; i++){//step sample by sample
		setNumInUint8Array(ret,inArray[i],i*bytesPerSample,bytesPerSample);
	}
	return ret;
};

function concatUint8Arrays(array1,array2){
	var ret = new Uint8Array(array1.length+array2.length);
	for(var i = 0; i<array1.length; i++) ret[i]=array1[i];
	for(var i = array1.length; i<array1.length+array2.length; i++) ret[i] = array2[i-array1.length];
	return ret;
};

function concatSegments(array1,array2){
	var ret = [];
	for(var i = 0; i<array1.length; i++) ret.push(array1[i]);
	for(var i = array1.length; i<array1.length+array2.length; i++) ret.push(array2[i-array1.length]);
	return ret;
}

class WAVFile {
	constructor(inUint8Array){//give it raw WAV data
		var holdDat = splitUint8Array(inUint8Array,44);
		this.header = holdDat[0];
		var holdBitrate = this.getBytesPerSample();
		this.data = WAVRawToSampleArray(holdDat[1],holdBitrate);
	}
	getBytesPerSample(){
		return getNumFromUint8Array(this.header,34,2)/8;
	}
	getNumChannels(){
		return getNumFromUint8Array(this.header,22,2);
	}
	getDataAsUint8Array(){
		return SampleArrayToWAVRaw(this.data,this.getBytesPerSample());
	}
	getSampleRate(){
		return getNumFromUint8Array(this.header,24,4);
	}
	setSampleRate(inRate){
		setNumInUint8Array(this.header,inRate,24,4);
	}
	updateSizeInHeaderToReflectData(){
		setNumInUint8Array(this.header,this.data.length*this.getBytesPerSample(),40,4);//"data"chunk
		setNumInUint8Array(this.header,this.data.length*this.getBytesPerSample()+36,4,4);//size in header
	}
	getSegment(start, length){//measured in seconds
		return getSegmentSection(this.data, start, length, this.getSampleRate(), this.getNumChannels());
	}
	getSize(){
		this.updateSizeInHeaderToReflectData();
		return getNumFromUint8Array(this.header,40,4);
	}
	saveToFile(path){
		log(">Saving file \""+path+"\"...");
		fs.writeFile(path, concatUint8Arrays(this.header,this.getDataAsUint8Array()), function(err) {
			if(err) {
				return console.log(err);
			}
			console.log("!File saved");
		});
	}
};

function Do(){
	outWAV.data = [];
	log(">Opening rule file \""+ruleFile+"\"...");
	holdRules = ruleListFromFile(ruleFile);
	log("!File opened");
	log(">Applying skipjacking rules");
	//outWAV.data = skipPitchSegment(inWAV,holdRules[0],20);
	skipjackWholeTrack(inWAV, outWAV, holdRules, 0);
	log("!Skipjacking rules applied");
	outWAV.saveToFile(outFile);
	log("!Press any key to start process again");
};

process.stdin.setRawMode(true);
process.stdin.resume();

if(inFile.split(".")[1].toLowerCase()!=="wav") log("!WARNING! This program only handles integer WAV files.  It will likely just corrupt anything else.");

log(">Opening source file \""+inFile+"\"...");
var inWAV = new WAVFile(fileToUint8Array(inFile));
var outWAV = new WAVFile(fileToUint8Array(inFile));
log("!File opened");
Do();
process.stdin.on('keypress', function (chunk, key) {
	Do();
});

/*
 "$&=/()
01234567
89?!,.AB
CDEFGHIJ
KLMNOPQR
STUVWXYZ
│─┌┬┐┤┘┴
└├┼░▓█<>
*/

/*
Standard Error Codes:
     #0: Invalid Operation            - Invalid operation at any hardware/software level. (Ex: Invalid opcode, line of interpreted code, etc.)
     #1: Virtual Resource Exhausted   - Machine cannot perform a task because it has used all of a resource. (Typically memory, disk space, or dedicated I.C.s)
     #2: Hardware Missing             - Requested hardware is not connected to the machine.
     #3: Physical Resource Exhausted  - Hardware connected to machine has depleted its physical resources. (Ex: Engine running out of fuel, cannon running out of rounds, printer running out of letter paper)
     #4: Unknown Command              - User command given to machine is unknown
     #5: No data                      - Void (File does not exist, web page has no data, input is null)
     #6: Invalid Parameter            - Command fails a Sanity Check, or input is outside of valid range (Ex: Tan(2π) in radian mode.)
     #7: Hardware Problem             - Issue with hardware device. (Ex: Device is powered off, arithmetic I.C. is busy, lp0 on fire)
     #8: Invalid Permissions          - User/client machine does not have permission to perform specified task.
     #9: No Connection                - Machine cannot make a connection (Ex: Network card cannot connect to specified host, spacecraft controller cannot contact known craft component).
*/