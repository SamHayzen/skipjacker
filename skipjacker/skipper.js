const fs = require('fs');
const readline = require('readline');
readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

//global variables
var lastAbsolute = 0;
var lastShift = 0;
var desiredRatio = 1;
var inFile = "in.wav";
var outFile = "out.wav";
var ruleFile = "rule.txt";
var exportSampleRate = 0;
var sampleCoefficient = 1;
var depoppingSensitivity = 0;
var quiet = false;

var holdRules;

var debug = false;
var JSONFileExists;

var markers = [];

if(process.argv[2]!==undefined){inFile = process.argv[2];}
if(process.argv[3]!==undefined){ruleFile = process.argv[3];}
if(process.argv[4]!==undefined){outFile = process.argv[4];}

function pInt(inNum){
	inNum = parseInt(inNum);
	if(inNum == NaN) inNum = 0;
	return inNum;
}

function pFloat(inNum){
	inNum = parseFloat(inNum);
	if(inNum == NaN) inNum = 0;
	return inNum;
}

function log(text){
	console.log(text);
}

function dlog(text){
	if(debug) console.log(text);
}

function relog(text){
	process.stdout.clearLine();
	process.stdout.cursorTo(0);
	process.stdout.write("$"+text);
}

Number.prototype.mod = function(n) {
    return ((this%n)+n)%n;
}; //thank you, https://web.archive.org/web/20090717035140if_/javascript.about.com/od/problemsolving/a/modulobug.htm

Number.prototype.abs = function(n) {
    if(this < 0) return this*-1;
	return this;
};

Number.prototype.sign = function(n) {
    if(this){
		return this/this.abs();
	}else{
		return this;
	}
};

Array.prototype.insert = function(index, inary) {
	while(inary.length){this.splice(++index, 0, inary.shift());}
};

Array.prototype.replace = function(index, length, inary) {
	var ret = this.splice(index, length); //delete
	while(inary.length){this.splice(++index, 0, inary.shift());}
	return ret; //you might want to keep what you deleted
};

function round(num){//just makes things easier
	return Math.round(num);
};

function addMarker(name, time){
	markers.push([name, time]);
}

function getMarkerTime(name){
	for(var i = 0; i < markers.length; i++) if(name == markers[i][0]) return markers[i][1];
	log("!Error! Unknown marker \""+name+"\", defaulting to 0 sec");
	return 0;
}

function fileToUint8Array(path){
	var retdat;
	retdat = Uint8Array.from(fs.readFileSync(path));
	log("!File opened");
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
	inTemplate = inTemplate.replace(/ |\r|\t/g,'').replace(/█/g,":");
	var holdTokens = inTemplate.split(":");//remove all white spaces and newlines and split by colons
	var holdMult = 1;
	var holdRule = {
		flag:false,
		iFlag:false,
		quiet:false,
		debug:false,
		isGap:false,
		advance:0,
		exportSampleRate:0,
		depoppingSensitivity:NaN,
		markerMode: -1, //-1 - none, 0 - set, 1 - goto
		markerName: "",
		repeat:1,
		factor:1,
		sampleTime:0,
		playTime:0,
		origin:-1,
		shift:NaN,
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
				holdLength = pFloat(holdArgs[0]);
				holdLength *= holdRule.sampleTime;
				holdRule.samples.push([holdLength,holdArgs[1],holdArgs[1].toLowerCase()]);//get the sample length (in seconds), forward character, and backwards character
			break;
			case 'r'://repeat
				holdRule.repeat = pInt(holdTokens[i].substr(1));
			break;
			case 'f'://factor/frequency
				holdRule.factor = pInt(holdTokens[i].substr(1));
			break;
			case 'l'://sample length
				holdRule.sampleTime = pFloat(holdTokens[i].substr(1));
			break;
			case 'o'://offset (from last origin)
				holdRule.offset = pFloat(holdTokens[i].substr(1));
			break;
			case 'a'://absolute origin/align
				holdRule.origin = pFloat(holdTokens[i].substr(1));
			break;
			case 'h'://shift
				holdRule.shift = pFloat(holdTokens[i].substr(1));
			break;
			case 'm'://multiplier
				holdMult = pFloat(holdTokens[i].substr(1));
			break;
			case 'c'://coefficient -- it's fine that this is set here even though it's global
				sampleCoefficient = pFloat(holdTokens[i].substr(1));
			break;
			case 't'://sample/playback time ratio
				holdRule.desiredRatio = pFloat(holdTokens[i].substr(1));
			break;
			case 'e'://exported file sample rate
				holdRule.exportSampleRate = pFloat(holdTokens[i].substr(1));
			break;
			case 'n'://depopping sensitivity
				holdRule.depoppingSensitivity = pFloat(holdTokens[i].substr(1));
			break;
			case 'u'://enable debug flag
				holdRule.debug = true;
			break;
			case 'x'://flag
				holdRule.flag = true;
			break;
			case 'i'://interval flag
				holdRule.iFlag = true;
			break;
			case 'q'://silence toggle flag
				holdRule.quiet = true;
			break;
			case 'g'://section is a silent gap
				holdRule.isGap = true;
			break;
			case 'd'://section should advance the read offset by its length
				holdRule.advance = pFloat(holdTokens[i].substr(1));
			break;
			case 'p'://pattern
				holdRule.pattern = holdTokens[i].substr(1);//remove first char from token
			break;
			case '!'://set marker
				holdRule.markerName = holdTokens[i].substr(1);//remove first char from token
				holdRule.markerMode = 0;
			break;
			case '>'://goto marker
				holdRule.markerName = holdTokens[i].substr(1);//remove first char from token
				holdRule.markerMode = 1;
			break;
			case '':
			break;
			default:
				log("unrecognized token header \'"+holdTokens[i].charAt(0)+"\' in rule \""+inTemplate+"\"");
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
	holdRule.sampleTime *= holdMult * sampleCoefficient;
	holdRule.playTime *= holdMult * sampleCoefficient;
	holdRule.advance *= sampleCoefficient;
	for(var i = 0; i<holdRule.samples.length; i++){holdRule.samples[i][0]*=holdMult * sampleCoefficient;} //multiply all the sample lengths by M * C
	dlog(holdRule);
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
		if(holdRule.toLowerCase().replace(/-| |\r|\t/g,'') == "kill") process.exit(0); //kill the program
		if(holdRule.toLowerCase().replace(/-| |\r|\t/g,'') == "eof") break; //end of file
		if(holdRule.toLowerCase().replace(/-| |\r|\t/g,'') == "sof"){ //start of file
			ret = [];
			continue;
		} //end of file
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
	lastAbsolute = 0, lastShift = 0, depoppingSensitivity = 0, desiredRatio = 1, exportSampleRate = 0, sampleCoefficient = 1, quiet = false, debug = false, markers = []; //don't want these to stay between runs
	for(var ruleNum = 0; ruleNum < ruleList.length; ruleNum++){
		if(ruleList[ruleNum].origin >= 0){
			lastAbsolute = ruleList[ruleNum].origin;
			dlog("origin set at "+lastAbsolute+"sec");
		}
		if(ruleList[ruleNum].offset > 0 || ruleList[ruleNum].origin >= 0) offset = ruleList[ruleNum].offset+lastAbsolute;
		if(!isNaN(ruleList[ruleNum].shift)){
			lastShift = ruleList[ruleNum].shift;
			dlog("shift set at "+offset+"sec ("+lastShift+"sec)");
		}
		if(ruleList[ruleNum].exportSampleRate>0) exportSampleRate = ruleList[ruleNum].exportSampleRate;
		if(!isNaN(ruleList[ruleNum].depoppingSensitivity)) depoppingSensitivity = ruleList[ruleNum].depoppingSensitivity;
		if(ruleList[ruleNum].desiredRatio>0) desiredRatio = ruleList[ruleNum].desiredRatio;
		if(ruleList[ruleNum].quiet) quiet = !quiet; //toggle quiet flag
		if(ruleList[ruleNum].debug) debug = true; //enable debug
		
		if(ruleList[ruleNum].markerMode == 0) addMarker(ruleList[ruleNum].markerName, offset);
		if(ruleList[ruleNum].markerMode == 1) offset = getMarkerTime(ruleList[ruleNum].markerName);
		
		if(ruleList[ruleNum].repeat < 1) continue; //don't waste time processing it if it's empty
		
		if(quiet){
			log(">Ignoring segment @"+round((offset+lastShift)*10000)/10000+"sec for ("+round(ruleList[ruleNum].repeat*ruleList[ruleNum].playTime*100)/100+"sec length)");
		}else{
			if(ruleList[ruleNum].isGap){
				log(">Adding gap @"+round((offset+lastShift)*10000)/10000+"sec for "+round(ruleList[ruleNum].sampleTime*ruleList[ruleNum].repeat*10000)/10000+" seconds");
				
				outTrack.data = concatSegments(outTrack.data, generateSilentSegment(ruleList[ruleNum].sampleTime*ruleList[ruleNum].repeat, inTrack.getSampleRate(), inTrack.getNumChannels()));
				totalTime+=ruleList[ruleNum].playTime*ruleList[ruleNum].repeat;
			}else{
				log(">Skipjacking @"+round((offset+lastShift)*10000)/10000+"sec for "+ruleList[ruleNum].repeat+" reps w/ pattern \'"+ruleList[ruleNum].pattern+"\' for "+round(ruleList[ruleNum].repeat*ruleList[ruleNum].playTime*10000)/10000+" seconds");
				if(round((ruleList[ruleNum].playTime/ruleList[ruleNum].sampleTime)*10000)/10000 !== desiredRatio && ruleList[ruleNum].playTime > 0) log("!WARNING: sample/playback time ratio does not match desired ratio\n$       ("+round((ruleList[ruleNum].playTime/ruleList[ruleNum].sampleTime)*10000)/10000+"/1 vs "+desiredRatio+"/1) This can destroy the track's time signature.");
				
				outTrack.data = concatSegments(outTrack.data, skipPitchSegment(inTrack, ruleList[ruleNum], offset+lastShift));
				totalTime+=ruleList[ruleNum].playTime*ruleList[ruleNum].repeat;
			}
		}
		if(!ruleList[ruleNum].isGap) offset+=ruleList[ruleNum].sampleTime*ruleList[ruleNum].repeat;
		
		if(ruleList[ruleNum].flag || ruleList[ruleNum].iFlag) log("!Flagged segment");
		
		if(ruleList[ruleNum].advance > 0) offset+=ruleList[ruleNum].advance;
	}
	if(depoppingSensitivity >= 0){
		log(">Applying depopping...");
		depopSegment(outTrack.data,outTrack.getNumChannels(),depoppingSensitivity,outTrack.getSampleRate());
	}
	if(exportSampleRate>0){
		log("\n!Done! Final track time is "+round(totalTime*100)/100+" seconds. ("+round(totalTime*100*inTrack.getSampleRate()/exportSampleRate)/100+" seconds at "+exportSampleRate+"hz)\n");
		outTrack.setSampleRate(exportSampleRate);
	}else{
		log("\n!Done! Final track time is "+round(totalTime*100)/100+" seconds.\n");
	}
}

function skipPitchSegment(track, rule, offset){//track should be a WAVFile class.  Offset measured in seconds
	var ret = [];
	if(rule.flag || rule.iFlag) ret.unshift(99999999,-99999999);
	for(var reps = 0; reps < rule.repeat; reps++){
		process.stdout.clearLine();
		process.stdout.cursorTo(0);
		process.stdout.write("$rep "+(reps+1)+"/"+rule.repeat);
		var holdSample = speedSegmentStereo(track.getSegment(offset,rule.sampleTime),rule.factor,true); //this gets the sample from the core track and speeds it up by the factor in the rule
		offset+=rule.sampleTime; //advance to the next sample
		var microSamples = [];//all the little bits that get skipped
		var holdPosition = 0;//holds the start position of subsequent microsamples within the sample
		for(var i = 0; i<rule.samples.length; i++){
			if(rule.samples[i][0]<0){
				microSamples.push({//if it's negative, just fill the same amount of time with silence
					sample:generateSilentSegment((rule.samples[i][0]/rule.factor)*-1,track.getSampleRate(),track.getNumChannels()),//samples[n][0] points to length of microsample of nth sample token
					foreChar:rule.samples[i][1],
					backChar:rule.samples[i][2],
				});
			}else{
				microSamples.push({
					sample:getSegmentSection(holdSample, holdPosition/rule.factor,rule.samples[i][0]/rule.factor,track.getSampleRate(),track.getNumChannels()),//samples[n][0] points to length of microsample of nth sample token
					foreChar:rule.samples[i][1],
					backChar:rule.samples[i][2],
				});
				holdPosition+=rule.samples[i][0];
			}
			
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
	process.stdout.clearLine();
	process.stdout.cursorTo(0);
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

function generateSilentSegment(length, sampleRate, numChannels){
	if(typeof numChannels !== 'number') numChannels = 1;
	var ret = [];
	var numSamples = round(length*sampleRate)*numChannels;
	for(var i = 0; i < numSamples; i++) ret.push(0);
	return ret;
}

function reverseSegment(segment, numChannels){
	while(segment.length.mod(numChannels) !== 0) segment.pop() //samples has to be devisable by channels
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
	var isSilence = false;
	if(segment[1] == 0) isSilence = true;
	while((segment.length).mod(2*factor) !== 0) segment.pop();
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
			//if((holdVal == 0 || isNaN(holdVal) || typeof holdVal !== 'number') && !isSilence) log("Broken sample: "+holdVal);
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

function appendSegments(array1,array2){
	for(var i = 0; i<array2.length; i++){
		array1.push(array2[i]);
	}
}

function depopSegment(inseg,numChan,sensitivity,sampleRate){
	if(sampleRate == undefined) sampleRate = 44100;
	if(sensitivity == undefined) sensitivity = 0;
	
	var remCount = 0;
	while(inseg.length.mod(numChan) !== 0) inseg.pop(); //make sure the number of samples is devisible by the number of audio channels
	
	for(var i = 0; i<inseg.length; i++) if(typeof inseg[i] !== 'number' || isNaN(inseg[i])) inseg[i] = 0;
	for(var i = numChan; i<inseg.length-numChan; i++){
		if(inseg[i] >= sensitivity*-1 && inseg[i] <= sensitivity){
			if(inseg[i-numChan].sign() == inseg[i+numChan].sign()){
				inseg[i] = (inseg[i-numChan] + inseg[i+numChan])/2; //average out the neighboring channels if sample is zero and both neighbors have the same sign
				dlog("$removed pop at segment @ "+round((i/numChan/sampleRate)*1000)/1000+"sec (channel "+(i.mod(numChan)+1)+")");
				remCount++;
			}
		}
	}
	log("!removed "+remCount+" pops");
}

class WAVFile {
	constructor(inUint8Array){//give it raw WAV data
		if(inUint8Array == undefined){
			this.header = new Uint8Array(44);
			this.data = [];
		}else{
			var holdDat = splitUint8Array(inUint8Array,44);
			this.header = holdDat[0];
			var holdBitrate = this.getBytesPerSample();
			this.data = WAVRawToSampleArray(holdDat[1],holdBitrate);
		}
	}
	copyFrom(inWAVObj){
		this.copyHeader(inWAVObj);
		this.data = [];
		for(var i = 0; i < inWAVObj.data.length; i++) this.data[i] = inWAVObj.data; //copy header
	}
	copyHeader(inWAVObj){
		for(var i = 0; i < 44; i++) this.header[i] = inWAVObj.header[i]; //copy header
	}
	saveToJSON(fileName){
		fs.writeFile(fileName, JSON.stringify({header:this.header, data:this.data}));
	}
	loadFromJSON(fileName){
		var fileData = JSON.parse(fs.readFileSync(fileName));
		this.copyHeader(fileData); //copy header
		this.data = fileData.data;
		this.updateSizeInHeaderToReflectData();
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
		setNumInUint8Array(this.header,inRate,24,4);//sample rate value
		setNumInUint8Array(this.header,inRate*this.getNumChannels()*this.getBytesPerSample(),28,4);//byte rate
	}
	updateSizeInHeaderToReflectData(){
		setNumInUint8Array(this.header,this.data.length*this.getBytesPerSample(),40,4);//"data" chunk
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
		this.updateSizeInHeaderToReflectData();
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

var inWav, outWav;

log(">Looking for preformatted JSON file");
if(fs.existsSync(inFile+".json")){
	log("!Found prefomatted JSON audio file");
	log(">Opening JSON file \""+inFile+".JSON\"...");
	inWAV = new WAVFile();
	inWAV.loadFromJSON(inFile+".JSON");
	outWAV = new WAVFile();
}else{
	log("!No preformatted JSON file of audio detected");
	log(">Opening source WAV file \""+inFile+"\"...");
	inWAV = new WAVFile(fileToUint8Array(inFile));
	outWAV = new WAVFile();
	log(">Saving audio data to .JSON for faster future access...");
	inWAV.saveToJSON(inFile+".JSON");
	log("!Saving preformatted JSON as "+inFile+".JSON in the background");
}
log("!Done fetching audio data");
outWAV.copyHeader(inWAV);
outWAV.updateSizeInHeaderToReflectData();

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