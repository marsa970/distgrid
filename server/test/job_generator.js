var fs = require("fs");

// Example "node job_generator.js filename tif 1000 node test_child_process.js -d 200"
var argv = process.argv;
var input_prefix = argv[2];
var input_suffix = argv[3];
var repeats = Number(argv[4]);
var run_in_shell = argv[5] === "-s" ? true : false;
var command_starts_at = run_in_shell ? 6 : 5;
var command = argv[command_starts_at];
var args = [];

for(var i = command_starts_at + 1; i < argv.length; i++ ){
    args.push(argv[i]);
}

var inpf = [];
for(var i = 0; i < repeats; i++){
    inpf.push(input_prefix + "_" + i + "." + input_suffix);
}

var output = {
    command: command,
    args: args,
    min_memory: 20,
    run_in_shell: run_in_shell,
    input_filenames: inpf
};

fs.writeFile("generated.json", JSON.stringify(output), () => {
    console.log("Done");
});
