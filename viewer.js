/** @constructor */

function Viewer(d, z, o, w)
{
    this.dump = d;
    this.zcanvas = z;
    this.ocanvas = o;
    this.wcanvas = w;
    this.attachEvents();
}

Viewer.prototype.setWav = function(wav)
{
    var calczoom = this.wav ? false : true;
    this.wav = wav;
    this.buildPeaks();
    if (calczoom) this.calcZoom();
    this.paintOverview();
    this.paintZoom();
    this.setNeedle(this.needle);
}

Viewer.prototype.attachEvents = function()
{
    (function(that) {
        var set_mouse = function(e) {
                if (e.buttons === 1) {
                    var rect = e.target.getBoundingClientRect();
                    var x = e.pageX - rect.left;
                    that.setNeedle((x - that.wcanvas.width/2) * that.xscale);
                }
            };
        that.ocanvas.onmousemove = set_mouse;
        that.ocanvas.onmousedown = set_mouse;

        /* Mousey nav */
        that.zcanvas.onmousedown = 
            function(e) {
                that.drag_start = e.offsetX;
                that.drag_needle_start = that.needle;
            };
        that.zcanvas.onmouseup = 
            function(e) {
                that.drag_needle_start =  that.drag_start = undefined;
            };
        that.zcanvas.onmouseleave = 
            function(e) {
                that.drag_needle_start = that.drag_start = undefined;
            };
        that.zcanvas.onmousemove = 
            function(e) {
                if (e.buttons === 1) {
                    that.setNeedle(that.needle - e.movementX/that.zoom);
                }
            };

        /* Wheel/scroll zoom same in both overview and detail canvases */
        var wheelzoom = function(e) {
            var delta = e.wheelDelta ? e.wheelDelta/200 : e.detail ? -e.detail : 0;
            //console.log("wheel delta=", delta, e.deltaX, e.deltaY);
            var z = that.zoom + delta;

            if (z < ZOOM_MIN) z = ZOOM_MIN;
            if (z > ZOOM_MAX) z = ZOOM_MAX;
            if (Math.abs(z - that.zoom) > ZOOM_EPS) {
                var oldzoom = that.zoom;
                that.setZoom(z, e.offsetX / oldzoom - e.offsetX / z);
            }
            return e.preventDefault() && false;
        };
        that.zcanvas.addEventListener("mousewheel", wheelzoom, false);
        that.ocanvas.addEventListener("mousewheel", wheelzoom, false);

        /* Touchy nav, scrolling with a finger */
        that.zcanvas.addEventListener("touchstart", function(e) {
                //console.log("touchstart x=", e.targetTouches[0].clientX);
                that.drag_start = e.targetTouches[0].clientX;
                that.drag_needle_start = that.needle;
            }, false);
        that.zcanvas.addEventListener("touchend", function(e) {
                that.drag_start = that.drag_needle_start = undefined;
            }, false);
        that.zcanvas.addEventListener("touchmove", function(event) {
            // If there's exactly one finger inside this element
            if (event.targetTouches.length == 1) {
                var touch = event.targetTouches[0];
                if (that.drag_start) {
                    that.setNeedle(that.drag_needle_start - 
                            (touch.clientX - that.drag_start) / that.zoom );
                }
            }
        }, false);
    })(this);
}

Viewer.prototype.setZoom = function(zoom, centrediff)
{
    this.zoom = zoom;
    //console.log("zoom=", this.zoom);

    this.wcanvas.width = Math.round(this.zcanvas.width / this.xscale / this.zoom);
    this.wcanvas.style.width = this.wcanvas.width + "px";
    this.setNeedle(this.needle + centrediff, true);
    this.paintZoom();
}

Viewer.prototype.setNeedle = function(position, norepaint) 
{
    this.needle = position;
    this.wcanvas.style.left = position/this.xscale + "px";
    if (!norepaint) { 
        this.paintZoom();
    }
}

Viewer.prototype.Decorate = function(decor)
{
    this.decor = decor;
    this.paintOverview();
    this.paintZoom();
}

Viewer.prototype.decorHeight = function(nest)
{
    var h = 1.0;
    switch (nest) {
        case 0: h = 1.0; break; /* SYNC */
        case 1: h = 0.9; break; /* Block container */
        case 2: h = 0.8; break; /* Block contents (name, subblock) */
        case 3: h = 0.7; break; /* Subparts (e.g. checksum) */
        case 4: h = 0.6; break; /* Subparts (e.g. checksum) */
        default: 
                h = 0.5; break;  /* wtf */
    }
    return h;
}

Viewer.prototype.paintZoom = function()
{
    var data = this.wav.Data;
    var start = Math.trunc(this.needle);
    var n = start;
    var far_right = start + Math.trunc(this.zcanvas.width / this.zoom);
    var c = this.zbctx;

    var mid_y = this.zcanvas.height / 2;
    var half_scale = mid_y/2;

    c.globalAlpha = 1.0;
    c.strokeStyle = "#fff";
    c.fillStyle = "#000";
    c.fillRect(0, 0, this.zcanvas.width, this.zcanvas.height);

    if (this.decor) {
        var decor = this.decor;
        for (var i = 0; i < decor.length; ++i) {
            var left = decor[i].begin;
            var right = decor[i].end;
            if (right < n || left > far_right) {
                continue;
            }
            var h = this.decorHeight(decor[i].nest);
            c.fillStyle = decor[i].color || Util.randomColor();
            var xleft = left - start;
            c.fillRect(xleft * this.zoom, 0, 
                    (right - left) * this.zoom, 
                    this.zcanvas.height * h);

            if (decor[i].text) {
                c.font = "11px monospace";
                c.fillStyle = "#fff";
                c.fillText(decor[i].text, xleft * this.zoom, 10);
            }
        }
    }

    c.globalAlpha = 0.4;
    c.beginPath();

    for (var i = 0, step = this.zoom; i < this.zcanvas.width; i += step) {
        var samp = data[n++];
        var y = mid_y - samp * this.yscale * half_scale;
        if (i === 0) {
            c.moveTo(i, y);
        } else {
            c.lineTo(i, y);
        }
    }
    c.stroke();

    this.zctx.drawImage(this.zbcanvas, 0, 0, this.zcanvas.width, 
            this.zcanvas.height);
}

Viewer.prototype.paintOverview = function()
{
    if (!this.octx || !this.pekkas) return;

    var ctx = this.octx;

    var width = this.ocanvas.width;
    var height = this.ocanvas.height;

    ctx.globalAlpha = 1.0;
    ctx.fillStyle = "#000"; //"#142";
    ctx.fillRect(0, 0, width, height);

    if (this.decor) {
        var decor = this.decor;
        for (var i = 0; i < decor.length; ++i) {
            var left = decor[i].begin / this.xscale;
            var right = (decor[i].end - decor[i].begin) / this.xscale;
            var h = this.decorHeight(decor[i].nest);
            ctx.fillStyle = decor[i].color || Util.randomColor();
            ctx.fillRect(left, 0, right, height * h);
        }
    }

    ctx.globalAlpha = 0.4;

    ctx.strokeStyle = "#fff";
    ctx.beginPath();
    for (var x = 0; x < width; ++x) {
        ctx.moveTo(x, height);
        ctx.lineTo(x, height - height * this.pekkas[x] * this.yscale);
    }
    ctx.stroke();
}

Viewer.prototype.createCanvases = function()
{
    this.ocanvas.width = window.innerWidth;
    this.ocanvas.height = 64;
    this.octx = this.ocanvas.getContext("2d");
    this.octx.translate(0.5, 0.5);

    this.zcanvas.width = window.innerWidth;
    this.zcanvas.height = 64;
    this.zctx = this.zcanvas.getContext("2d");

    this.wcanvas.width = 32;
    this.wcanvas.height = 64;
    this.wctx = this.wcanvas.getContext("2d");

    /* buffer canvas for zoom view */
    this.zbcanvas = document.createElement("canvas");
    this.zbcanvas.width = this.zcanvas.width;
    this.zbcanvas.height = this.zcanvas.height;
    this.zbctx = this.zbcanvas.getContext("2d");
    this.zbctx.translate(0.5, 0.5);
}

Viewer.prototype.buildPeaks = function()
{
    this.createCanvases();

    this.pekkas = new Float32Array(this.ocanvas.width);
    var pidx = 0;

    var val = 0;
    var n = 0;
    var data = this.wav.Data;
    var width = this.ocanvas.width;
    var height = this.ocanvas.height;
    var ratio = width / data.length;
    var max = -1;

    for (var i = 0, end = data.length; i < end; ++i) {
        val += Math.abs(data[i]); ++n;
        var next = Math.trunc(i * ratio);
        if (next > pidx) {
            this.pekkas[pidx] = val / n;
            if (this.pekkas[pidx] > max) {
                max = this.pekkas[pidx];
            }
            n = val = 0;
            pidx = next;
        }
    }
    this.xscale = data.length / width;
    this.yscale = 1 / max;
}

Viewer.prototype.calcZoom = function()
{
    var data = this.wav.Data;

    this.zoom = 1;

    var ratio = this.ocanvas.width / data.length;

    var window_width = Math.round(this.zcanvas.width * ratio / this.zoom);
    if (window_width < 32) {
        this.zoom = this.zcanvas.width * ratio / 32; 
        if (this.zoom < 0.33) this.zoom = 0.33;
        window_width = Math.round(this.zcanvas.width * ratio / this.zoom);
    }


    this.wcanvas.width = window_width;
    this.wcanvas.style.width = this.wcanvas.width + "px";

    this.setNeedle(0);
}
