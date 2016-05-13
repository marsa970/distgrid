console.log("test_child_process");

/*
Flags:
-e : Exit with code 1 indicating error, this happens last
-d [ms] : Delay exit with ms
-b [ms] : Busywait ms
-w [million cycles] : Waste this many loops
-r : Read inputfile to memory
-o : Output read file
*/

var fs = require("fs");

// Read input to memory
var i = process.argv.indexOf("-r");
var file_data = null;
var output = null;
if(i!= -1){
    if( process.argv.indexOf("-o") != -1){
        output = process.argv.pop();
    }
    input = process.argv.pop();
    var stat = fs.statSync(input);
    if(stat.isFile()){
        file_data = fs.readFileSync(input);
    } else {
        throw "" + input + " is not a file!";
    }
}

// Delay exit
i = process.argv.indexOf("-d");
if(i != -1){
    try{
        var ms = Number(process.argv[i+1]);
        setTimeout(postWait, ms);
    } catch(error){
        console.log(error);
        process.exit(1);
    }
}

// Busywait ms
i = process.argv.indexOf("-b");
if(i != -1){
    var now = Date.now();
    var start_at = now;
    var ms = Number(process.argv[i+1]);
    while( start_at + ms >= now){
        now = Date.now();
    }
}

// Waste cycles
i = process.argv.indexOf("-w");
if(i != -1){
    var mcycles = process.argv[i+1];
    for(var j = 0; j < mcycles; j++){
        for(var k = 0; k < 1000000;k++){
            //Do nothing
        }
    }
}

if( output != null ){
    fs.writeFileSync(output, file_data);
}

// Exit with error
if(process.argv.indexOf("-e") != -1){
    process.exit(1);
}
