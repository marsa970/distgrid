var fs = require("fs");
var path = require("path");

// Example: node file_creator 40000 80 F80S4 Z:\ -p

var no_files = process.argv[3];
var filenames = [];
for(var i = 0; i < no_files; i++){
    filenames.push("outfile" + i + ".test");
}

var createFile = function(name, data){
    fs.writeFileSync(name, data);
    /*
    fs.writeFile(name, data, function(error){
        if( error ){
            console.log("Could not write file", name);
            console.log(error);
            console.log("Exiting");
            process.exit(1);
        } else {
            console.log("Created", name);
        }
    });
    */
    console.log("Created", name);
};

var times = process.argv[2];
/*
var base = "P".repeat(1050); // 1 kb
var output = "";
for( var i = 0; i < times; i++){
    output += base;
}
*/
var output = Buffer.allocUnsafe(times * 1024);

var base_path = "";
if( process.argv.length > 4){
    console.log("Writing to subdir");
    base_path = process.argv[4];
}

for(var i = 0; i < filenames.length; i++){
    createFile(path.join(base_path,filenames[i]), output);
}

var output_filename_paths = [];
var filesyspath = process.argv[5];
filenames.forEach(function(filename){
    output_filename_paths.push(path.join(filesyspath, base_path, filename));
});

if( process.argv.indexOf("-p") != -1){
    var redFunc = function(total, add){
        return total + "/" + add;
    };
    for( var i = 0; i < output_filename_paths.length; i++){
        var posix_path = output_filename_paths[i].split(path.sep).reduce(redFunc);
        output_filename_paths[i] = posix_path;
    }
}

createFile(path.join(base_path,"job_desc.json"), JSON.stringify(output_filename_paths));
