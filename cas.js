/* Low level analyser
 * Find BPSK parameters and scan the intervals.
 */

/** @constructor */
function Cas(wavwerk) 
{
    this.wavwerk = wavwerk;
    this.dilate = 1;
}

Cas.prototype.ScanBPSK = function(finished_cb)
{
    this.scanIntervals();
    //this.analyzeHistogram();
    this.analHistogram2();
    finished_cb && finished_cb(this);
}

Cas.prototype.CreateHistogramCanvas = function()
{
    return this.paintHistogram(this.histogram, this.totalmax, 
            [this.Short, this.Long]);
}

Cas.prototype.CreateHistogramDescription = function()
{
    var histogram_description = document.createElement("pre");
    histogram_description.setAttribute("id", "histogram-description-pre");
    histogram_description.innerHTML = 
        "Анализ гистограммы<br/>" +
        "Короткий интервал: " + this.Short + "<br/>" +
        "Длинный интервал: " + this.Long + "<br/>";

    return histogram_description;
}

Cas.prototype.scanIntervals = function()
{
    const hist = 3192; //4096;

    this.wavwerk.rewind();

    var intervals = [];

    var out = -1;
    var previous_playhead = 0;

    var histogram = new Int32Array(256);

    for (;!this.wavwerk.eof();) {
        var playhead = this.wavwerk.playhead;
        var x = this.wavwerk.next();

        var next = out;
        if (out < 0) {
            if (x > 0 + hist) {
                next = 1;
            }
        }
        if (out > 0) {
            if (x < 0 - hist) {
                next = -1;
            }
        }

        if (next !== out) {
            var interval = playhead - previous_playhead;
            if (interval < histogram.length) {
                ++histogram[interval];
            } else {
                ++histogram[histogram.length - 1];
            }

            intervals.push([interval, previous_playhead]);
            previous_playhead = playhead;
            out = next;
        }
    }

    intervals.push([100, previous_playhead]);

    this.intervals = intervals;
    //console.log(intervals);
    this.histogram = histogram;
}

Cas.prototype.analHistogram2 = function()
{
    var h = this.histogram;
    var maxima = [];

    var hmin = 1, hmax = h.length;

    for (var m = 0; m < 2; ++m) {
        /* Find a maximum */
        var max = 0;
        var max_i = 0;
        for (var i = hmin; i < hmax - 1; ++i) {
            if (h[i] > max) {
                max = h[i];
                max_i = i;
            }
        }
        var small_valley = max/100 * 30;

        /* Descend off its shoulders until a valley on each side */
        var i1 = max_i, i2 = max_i;
        for (var moved = 0;; moved = 0) {
            if (i1 > 0 && h[i1 - 1] < h[i1]) {
                --i1;
                ++moved;
            } else if (i1 > 0 && h[i1 - 1] >= small_valley && h[i1 - 1] - small_valley < h[i1]) {
                --i1;
                ++moved;
            }
            if (i2 < h.length && h[i2 + 1] < h[i2]) {
                ++i2;
                ++moved;
            } else if (i2 < h.length && h[i2 + 1] >= small_valley && h[i2 + 1] - small_valley < h[i2]) {
                ++i2;
                ++moved;
            }
            if (!moved) break;
        }
        
        /* Record the peak and its bounds */
        maxima[m] = [i1, max_i, i2];
        /* Update eligible interval and proceed to the next one */
        hmin = i2 + 1;
    }

    this.totalmax = Math.max(h[maxima[0][1]], h[maxima[1][1]]);
    this.histogram = h.slice(0, maxima[1][2] + 10);

    this.Short = maxima[0][1];
    this.Long = maxima[1][1];

    //console.log(maxima);
}

Cas.prototype.analyzeHistogram = function()
{
    var bounds = [0,0,0,0];

    var area = 0;
    var max = 0;
    var peak = 0;

    var maxima = [];
    var areae = [];
    var peaks = []; /* indices of maxima */
    var hist_right = 0;     /* right margin of useful histogram data */
    /* search max1 */
    var state = 0; 

    var h = this.histogram;
    for (var i = 1; i < h.length - 1; ++i) {
        if (state%2 === 0) {
            /* Search for the first peak */
            area+= h[i];
            if (h[i] > max & h[i] >= 3) {
                bounds[state] = i;
                max = h[i];
                peak = i;
                ++state;
            }
        }
        if (state%2 === 1) {
            area += h[i];
            if (h[i] > max) {
                max = h[i];
                peak = i;
            }

            /* Found the division */
            if (h[i] < max * 0.0005) { 
                bounds[state] = i - 1; /* Update bounds */
                maxima[Math.trunc(state/2)] = max;
                areae[Math.trunc(state/2)] = area;
                peaks[Math.trunc(state/2)] = peak;
                max = 0;
                area = 0;
                peak = 0;
                ++state;
            }

            if (state > 3) {
                hist_right = i + 10;
                break;
            }
        }
    }

    console.log("hist=", h);
    console.log("bounds=", bounds, "area=", areae, " maxima=", maxima, " @=",
            peaks);

    console.log("Estimated periods: RR=", peaks[0], " NR=", peaks[1]);

    this.totalmax = maxima[0] > maxima[1] ? maxima[0] : maxima[1];
    this.histogram = h.slice(0, hist_right);

    this.Long = peaks[1];
    this.Short = peaks[0];
}

Cas.prototype.paintHistogram = function(h, max, peaks)
{
    const canvas_h = 64;

    var canvas = document.createElement("canvas");
    canvas.width = 4 * h.length;
    canvas.height = canvas_h;
    canvas.style.width = 4 * h.length + "px";
    canvas.style.height = canvas.height + "px";

    var ctx = canvas.getContext("2d");
    ctx.translate(0.5, 0.5);
    //ctx.fillStyle = "#111";
    //ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#880";
    ctx.beginPath();
    for (var i = 0; i < h.length; ++i) {
        ctx.moveTo(i * 4, canvas_h);
        ctx.lineTo(i * 4, canvas_h - h[i]/max * canvas_h);
    }
    ctx.stroke();

    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    for (var q = 0; q < 2; ++q) {
        var i = peaks[q]; 
        ctx.moveTo(i * 4, canvas_h);
        ctx.lineTo(i * 4, canvas_h - h[i]/max * canvas_h);
    }
    ctx.stroke();

    return canvas;
}

Cas.prototype.IntervalToSample = function(i) 
{
    //return this.intervals[i][1];//-this.Long;// + this.Short;
    if (i < this.intervals.length) {
        var dLi = this.dilate * Math.abs(this.intervals[i][0] - this.Long);
        var dSi = Math.abs(this.intervals[i][0] - this.Short);
        //if (this.getInterval(i)[0] == "L") {
        if (dLi < dSi) {
            return this.intervals[i][1] + this.Short;
        } else {
            return this.intervals[i][1];
        }
    }
}

Cas.prototype.getInterval = function(i, dilate)
{
    /* Should be 1, but on some fucked up tapes, up to 2 does magic */
    var dilate_factor = dilate ? dilate : this.dilate;

    var dLi = dilate_factor * Math.abs(this.intervals[i][0] - this.Long);
    var dSi = Math.abs(this.intervals[i][0] - this.Short);

    var dLi1 = dilate_factor * Math.abs(this.intervals[i+1][0] - this.Long);
    var dSi1 = Math.abs(this.intervals[i+1][0] - this.Short);

//    if (dLi === dSi) {
//        console.log("WARNING: dLi === dSi at position ",
//                this.intervals[i][1]);
//    }
//    if (dLi1 === dSi1) {
//        console.log("WARNING: dLi1 === dSi1 at position ",
//                this.intervals[i+1][1]);
//    }


    if (dLi < dSi && dLi1 < dSi1) return "LL";
    if (dLi < dSi && dLi1 >= dSi1) return "LS";
    if (dLi >= dSi && dLi1 < dSi1) return "SL";
    if (dLi >= dSi && dLi1 >= dSi1) return "SS";

    /* Must not end up here */
    console.log("fml");
}

Cas.prototype.dump = function()
{
    return Util.dump(this.rawbytes, "Raw tape dump");
}

Cas.prototype.IntervalCount = function()
{
    return this.intervals ? this.intervals.length : 0;
}
