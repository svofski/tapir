const FORMAT_GAVE_UP = "la cucaracha ya no quiere caminar";

var target = document.getElementById("fileselect");
var lastinput = null;
var defaultfilter = null;
var defaultskew = 1;
var defaulthyst = 100;
var view = null;
var fileSelectHandler = 
    function(e, oldinput, filter, skew, oldview, hyst) 
    {
    defaultfilter = filter || defaultfilter;
    defaultskew = skew || defaultskew;
    defaulthyst = hyst || defaulthyst;
    if (!e && !oldinput) {
        return;
    }
    console.log("fileSelectHandler: e=", e);
    var input = oldinput || document.getElementById("fileselect");
    console.log("input.files[0]=", input.files[0]);
    var read = new FileReader();
    var file = input.files[0];

    read.onloadend = function(e) {
        console.log("Got content: ",  file.type, " name: ", file.name,
                " size: ", file.size);
        console.log("Content length: ", read.result.byteLength);
        if (file.type === "audio/wav" || file.type === "audio/x-wav") {
            var wav = new Wav(file.name, new Uint8Array(read.result), 
                    defaultfilter);
            if (wav) {
                view = oldview || new Viewer(
                        document.getElementById("dump"),
                        document.getElementById("wav-zoom"),
                        document.getElementById("wav-overview"),
                        document.getElementById("wav-window"));
                view.setWav(wav);

                var wavwerk = new Wavwerk(wav);
                var bpskanalyser = new Cas(wavwerk);
                bpskanalyser.SetSkew(defaultskew);
                bpskanalyser.SetHyst(defaulthyst);

                var formats = [new FRaw(), new FKrista(), new FVector(),
                    NewFRk86(), NewFMicrosha(), NewFSpec(), 
                    NewFVectorDOS(),
                    new FVectorCsave(), new FVectorBsave(), 
                    new FVectorEDASM()];

                var formats_done = formats.length;
                var results = [];
                
                var display_result = function(n) {
                    var tc = document.getElementById("dump-etc");
                    tc.innerHTML = "";
                    var dump = results[n].fmt.dump(view, bpskanalyser);
                    tc.appendChild(dump);
                    view.Decorate(results[n].fmt.GetDecor(bpskanalyser));
                };

                var present_results = function() {
                    results.sort(function(a,b) {
                        return b.confidence - a.confidence;
                    });
                    var sel = document.createElement("select");
                    var rc = document.getElementById("result-sel");
                    rc.innerHTML = "";
                    rc.appendChild(sel);

                    for (var i = 0; i < results.length; ++i) {
                        var o = document.createElement("option");
                        o.innerText = results[i].fmt.FormatName;
                        o.format_idx = i;
                        sel.appendChild(o);
                    }

                    sel.addEventListener('change', function(e) {
                        display_result(e.target.selectedIndex);
                    });
                    display_result(0);
                };

                var addresult = function(scanner) {
                    results.push(
                        {confidence: scanner.format.Confidence(),
                         fmt: scanner.format});
                    logcontainer = document.getElementById("log-etc");
                    logcontainer.appendChild(scanner.log);
                    if (--formats_done === 0) {
                        present_results();
                    }
                };

                bpskanalyser.ScanBPSK(function(bpsk) {
                    Util.deleteChildren("histogram-etc");
                    Util.deleteChildren("dump-etc");
                    Util.deleteChildren("log-etc");
                                     
                    var hcontainer = document.getElementById("histogram-etc");
                    hcontainer.appendChild(bpsk.CreateHistogramCanvas());
                    hcontainer.appendChild(bpsk.CreateHistogramDescription());

                    for (var i in formats) {
                        new Scanner(bpskanalyser, formats[i]).
                            Scan(addresult);
                    }
                });
            }
        }
    };
    read.readAsArrayBuffer(input.files[0]);

    // stash the input for rereading
    lastinput = input;

    // recreate the input thingy                                
    input = document.createElement("input");                
    input.className = "upload";                                 
    input.type = "file";                                        
    input.name = "fileselect[]";                                
    input.addEventListener("change", fileSelectHandler);        
    fileselect.parentNode.replaceChild(input, fileselect);      
    input.id = "fileselect";                              
};
target.addEventListener("change", fileSelectHandler, false);


var fitlerchange = function(e) {
    switch (e.target.id) {
        case "fir0":    fileSelectHandler(null, lastinput, new Bypass(), 
                                false, view);
                        break;
        case "fir1":    fileSelectHandler(null, lastinput, 
                                new Filter(Filter.A), false, view);
                        break;
        case "fir2":    fileSelectHandler(null, lastinput, 
                                new Filter(Filter.B), false, view);
                        break;
        default:
                        break;
    }
};
document.getElementById("fir0").addEventListener("change", fitlerchange, false);
document.getElementById("fir1").addEventListener("change", fitlerchange, false);
document.getElementById("fir2").addEventListener("change", fitlerchange, false);

var skewchange = function(e) {
    switch (e.target.id) {
        case "skew0": fileSelectHandler(null, lastinput, null, 1, view);
                        break;
        case "skew2": fileSelectHandler(null, lastinput, null, 2, view);
                        break;
    }
};

document.getElementById("skew0").addEventListener("change", skewchange, false);
document.getElementById("skew2").addEventListener("change", skewchange, false);

["hyst100","hyst3192"].forEach(
    function(id) {
        document.getElementById(id).addEventListener("change",
            function(e) {
                var value = parseInt(e.target.id.substring(4));
                fileSelectHandler(null,lastinput,null,1,view,value);
            },
            false);
    });

