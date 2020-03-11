const big = require('big.js');

overWriteArray = function(source, destination){
	if(typeof destination !== 'object'){
		console.log("overWriteValue given non-object");
		return;
	}
	switch(typeof source){
		case 'number':
			bigToUint8Array(big(source),destination);
		break;
		case 'string':
			source = source.split('');
			for(var i = 0; i<source.length && i<destination.length; i++){
				source[i] = source[i].charCodeAt(0);
			}
		case 'object':
			destination.fill(0);
			for(var i = 0; i<source.length && i<destination.length; i++){
				destination[i] = source[i];
			}
		break;
	}
	
}

bigToUint8Array = function(toConv, destination){
	destination.fill(0);
	var holdPointer = 0;
	while(destination.length > holdPointer && !toConv.eq(0)){
		destination[holdPointer] = toConv.mod(0x100);
		toConv = toConv.minus(toConv.mod(0x100)).div(0x100);
		holdPointer++;
	}
	return destination;
}

Uint8ArrayToBig = function(toConv){
	var hold = big(0);
	for(var i = toConv.length-1; i>-1; i--){
		hold = hold.add(toConv[i]);
		if(i!=0) hold = hold.times(0x100);
	}
	return hold;
}

arrayArithmetic = {
	add: function(a, b, destination){
		
	},
	sub: function(a, b, destination){
		
	}
}

cherryVariable = function(length, name, data){
	this.data = new Uint8Array(length);
	this.name = name;
	if(typeof data != 'undefined'){
		overWriteArray(data, this.data);
	}
};

cherryInstance = function(code){
	if(typeof code !== 'string') code = "print \"Hello world!\"\nreturn";
	this.addressStack = [];
	this.line = 0;
	this.instructions = code.split("\n");
	for(var i = 0; i<this.instructions.length; i++){
		if(this.instructions[i].split(' ')[0] !== ":main") continue;
		this.line = ++i;
		break;
	}
	this.variables = [new cherryVariable(code.length,"body",code), new cherryVariable(3,"line",this.line), new cherryVariable(4,"lastVal","css\n"), new cherryVariable(4,"displayPrefix","css\n")];
};

getVariableIndexByName = function(instance, varName){
	for(var i = 0; i<instance.variables.length; i++){
		if(instance.variables[i].name == varName) return i;
	}
	return -1;
};

getVariableDataByName = function(instance, varName){
	if(typeof varName !== 'string'){
		console.log("Non-string passed to getVariableDataByName as varName");
		return false;
	}
	var holdIndex = getVariableIndexByName(instance, varName.replace(/%/g,''));
	if(holdIndex == -1) return false;
	return instance.variables[holdIndex].data;
};

varToPrimitiveNumber = function(source){
	return parseInt(Uint8ArrayToBig(source.data));
}

splitArgs = function(instring){
	if(typeof instring !== "string") return [];
	instring = instring.replace(/^\s+|\s+$/g,'').replace(/\\"/g,String.fromCharCode(0)).match(/'[^']*'|"[^"]*"|\S+/g) || [];
	for(var i = 0; i < instring.length; i++){
		instring[i] = instring[i].split(String.fromCharCode(0)).join('\\"');
	}
	return instring;
};

argumentToUint8Array = function(instance, argument){
	var retArray = new Uint8Array(0);
	switch(argument.charAt(0)){
		case '%': //Variable
			console.log(argument);
			return getVariableDataByName(instance, argument);
		break;
		case '"': //String
			argument = argument.substring(1, argument.length-1); //remove quotes
			retArray = new Uint8Array(argument.length);
			overWriteArray(argument,retArray);
			
			return retArray;
		break;
		case '[': //Array
		
		break;
		case ':': //is label
			for(var i = 0; i < instance.instructions.length; i++){
				if(instance.instructions[i].split(' ')[0] !== argument) continue;
				return bigToUint8Array(big(i+1),new Uint8Array(3));
			} //couldn't find that label if loop finishes
		break;
		case '0':
		case '1':
		case '2':
		case '3':
		case '4':
		case '5':
		case '6':
		case '7':
		case '8':
		case '9':
		default:
		
		break;
	}
	return false;
}

setLastVal = function(instance, data){
	var lastValIndex = getVariableIndexByName(instance, "lastVal");
	if(lastValIndex==-1) return true; //return true if there's a problem
	instance.variables[lastValIndex].data = new Uint8Array(data.length); // resize %lastVal to fit the new value
	for(var i = 0; i<data.length; i++){
		instance.variables[lastValIndex].data[i] = data[i]; //copy over the data
	}
	return false;
};

stepCherry = function(instance){
	var statusObj = {printOut:false,errorCode:-1,errorText:"No Error",exit:false};
	var lineVarIndex = getVariableIndexByName(instance, "line");
	if(lineVarIndex ==-1){
		return {printOut:false,errorCode:5,errorText:"Error #5:\n$ Fatal error, line counter does not exist",exit:true};
	}
	var line = varToPrimitiveNumber(instance.variables[lineVarIndex]);
	if(line>instance.instructions.length) return {printOut:false,errorCode:-1,errorText:"No Error",exit:true};
	var lineArgs = splitArgs(instance.instructions[line]);
	console.log(lineArgs);
	var instruction = [];
	while(lineArgs.length){
		if(lineArgs[0].indexOf("->")==0) break;
		instruction.push(lineArgs.shift());
	}
	if(instruction.length>0){
		switch(instruction[0].charAt(0)){
			case '%': //is variable
			case ':': //is label
			case '"': //is string
			case '0': //is num
			case '1':
			case '2':
			case '3':
			case '4':
			case '5':
			case '6':
			case '7':
			case '8':
			case '9':
				var holddata = argumentToUint8Array(instance, instruction[0]); //will return false if there's a problem
				if(holddata){
					setLastVal(instance, holddata);
				}else{
					statusObj.errorCode = 5;
					statusObj.errorText = "Error #5:\n$ Warning, \""+instruction[1]+"\" at line "+(line+1)+" is not a valid variable, label or value";
				}
			break;
			case '!':
			
			break;
			default:
				switch(instruction[0].toLowerCase()){
					case 'print':
						if(instruction.length>1){
							var holddata = argumentToUint8Array(instance, instruction[1]); //will return false if there's a problem
							if(holddata){
								statusObj.printOut = String.fromCharCode.apply(null, holddata);
							}else{
								statusObj.errorCode = 5;
								statusObj.errorText = "Error #5:\n$ Warning, \""+instruction[1]+"\" at line "+(line+1)+" is not a valid variable, label or value";
							}
						}else{
							statusObj.errorCode = 6;
							statusObj.errorText = "Error #6:\n$ Warning, print command at line "+(line+1)+" is missing 1st parameter";
						}
					break;
					case 'goto':
						if(instruction.length>1){
							var holddata = argumentToUint8Array(instance, instruction[1]); //will return false if there's a problem
							bigToUint8Array(Uint8ArrayToBig(holddata).sub(1), instance.variables[lineVarIndex].data); //jump to a certain label/line
						}else{
							statusObj.errorCode = 6;
							statusObj.errorText = "Error #6:\n$ Warning, goto command at line "+(line+1)+" is missing 1st parameter";
						}
					break;
				}
			break;
		}
	}
	line = varToPrimitiveNumber(instance.variables[lineVarIndex]); //reload line, as it may have been changed since last fetch
	overWriteArray(++line, instance.variables[lineVarIndex].data); //line++
	return statusObj;
};

module.exports = {cherryInstance: cherryInstance, cherryVariable: cherryVariable, overWriteArray: overWriteArray, Uint8ArrayToBig: Uint8ArrayToBig, bigToUint8Array: bigToUint8Array, getVariableIndexByName: getVariableIndexByName, getVariableDataByName: getVariableDataByName, varToPrimitiveNumber: varToPrimitiveNumber, splitArgs: splitArgs, argumentToUint8Array: argumentToUint8Array, stepCherry: stepCherry};