function Util() {
}

Util.char8 = function(val) {
    var res = '.';
    if (val > 32 && val < 127) res = String.fromCharCode(val);
    if (res === '<') {
        res = '&lt;'; 
    } else if (res === '>') {
        res = '&gt;';
    }
    return res;
};

Util.hex8 = function(val) {
    if (val < 0 || val > 255)  return "??";

    var hexstr = "0123456789ABCDEF";
    return hexstr[(val & 0xf0) >> 4] + hexstr[val & 0x0f];
};

Util.hex16 = function(val) {
    return Util.hex8((val & 0xff00) >> 8) + Util.hex8(val & 0x00ff);
};

Util.isWhitespace = function(c) {
    return c=='\t' || c == ' ';// this is too slow c.match(/\s/);
};

Util.toTargetEncoding = function(str, encoding) {
    return toEncoding(str, encoding);
};

Util.dumpspan = function(mem, org, mode) {
    var result = "";
    var nonempty = false;
    var conv = mode ? Util.char8 : Util.hex8;

    if (mem[org] === undefined) return false;

    for (var i = org; i < org+16; i++) {
        if (mem[i] !== undefined) nonempty = true;
        if (mode == 1) {
            result += conv(mem[i]);
        } else {
            result += (i > org && i%8 === 0) ? "-" : " ";
            if (mem[i] === undefined) {                                    
                result += '  ';
            } else {
                result += conv(mem[i]);
            }
        }
    }

    return nonempty ? result : false;
};

Util.dumpcanvas = function(mem, org)
{
    var c = document.createElement("canvas");
    c.width = 8;
    c.height = 16;
    c.setAttribute("class", "dc");
    var ctx = c.getContext("2d");
    ctx.translate(0.5, 0.5);

    var dat = ctx.getImageData(0, 0, 8, 16);
    var bmp = new Uint32Array(dat.data.buffer);
    
    for (var i = 0, ofs = 0; i < 16; ++i) {
        var b = mem[org + i];
        
        bmp[ofs++] = (b & 0x80) ? 0xffffffff : 0;
        bmp[ofs++] = (b & 0x40) ? 0xffffffff : 0;
        bmp[ofs++] = (b & 0x20) ? 0xffffffff : 0;
        bmp[ofs++] = (b & 0x10) ? 0xffffffff : 0;
        bmp[ofs++] = (b & 0x08) ? 0xffffffff : 0;
        bmp[ofs++] = (b & 0x04) ? 0xffffffff : 0;
        bmp[ofs++] = (b & 0x02) ? 0xffffffff : 0;
        bmp[ofs++] = (b & 0x01) ? 0xffffffff : 0;
    }
    ctx.putImageData(dat, 0, 0);
    return c;
}

Util.dump = function(mem, title, pretitle, is_valid, info_cb, infoclick_cb) {
    var org = 0;

    if (org % 16 !== 0) org = org - org % 16;

    var result = [];
    if (pretitle) {
        var pretit = document.createElement("pre");
        pretit.innerHTML = pretitle;
        result.push(pretit);
    }
    
    {
        var tit = document.createElement("pre");
        tit.innerHTML = title || "Raw tape dump:";
        result.push(tit);
    }
    {
        var hdiv = document.createElement("div");
        hdiv.setAttribute("class", "hordiv");
        result.push(hdiv);
    }

    var lastempty;
    var printline = 0;

    for (var i = org, end_i = mem.length; i < end_i; i += 16) {
        var info;
        if (info_cb) info = info_cb(i);

        var span = this.dumpspan(mem, i, 0);    /* mode 0: hex */
        var valid = true;
        var p1;
        if (span || !lastempty) {
            if (is_valid) valid = is_valid(i);
            var cls = !is_valid ? 'd' : valid ? 'd' : 'e';
            p1 = document.createElement("pre");
            p1.setAttribute("class", cls + (printline++%2));
            if (info) {
                p1.setAttribute("blk", info.blknum);
                p1.setAttribute("sblk", info.sblknum);
                p1.addEventListener("click", infoclick_cb, false);
            }
        }                                                                       
        if (span) {
            var text = Util.hex16(i) + ": ";
            text += span;
            text += '  ';
            text += this.dumpspan(mem, i, 1);   /* mode 1: characters */
            p1.innerHTML = text;
            p1.appendChild(this.dumpcanvas(mem, i));
            result.push(p1);

            //result.push(this.dumpcanvas(mem, i));

            if (!valid && info) {
                if (info) {
                    var binfo = document.createElement("pre");
                    binfo.setAttribute("class", "bi");
                    text = "Block: " + Util.hex8(info.blknum) + "." + info.sblknum;
                    text += " Read: " + Util.hex8(info.cs_read);
                    text += " Eval: " + Util.hex8(info.cs_calculated);
                    binfo.innerHTML = text;
                    p1.appendChild(binfo);
                    //result.push(binfo);
                }
            }
            //result.push(document.createElement("br"));
            lastempty = false;
        }
        if (!span && !lastempty) {
            //result += " </pre><br/>";
            lastempty = true;
        }
    }

    var div = document.createElement("div");
    div.setAttribute("class", "dump-container");
    for (var i = 0; i < result.length; ++i) {
        div.appendChild(result[i]);
    }
    return div;                                                              
};           

Util.randomColor = function()
{
    var r = Math.trunc(Math.random() * 15).toString(16);
    var g = Math.trunc(Math.random() * 15).toString(16);
    var b = Math.trunc(Math.random() * 15).toString(16);
    return "#" + r + g + b;
};

Util.deleteChildren = function(id)
{
    var parent = document.getElementById(id);
    for (var i = 0, end = parent.childElementCount; 
            id && i < end; ++i) {
        parent.removeChild(parent.children[0]);
    }
};
