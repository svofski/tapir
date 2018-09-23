function Util() {
}

Util.char8 = function(val, transparent) {
    var res = '.';
    if (val > 32 && val < 127) res = String.fromCharCode(val);
    if (!transparent) {
        if (res === '<') {
            res = '&lt;'; 
        } else if (res === '>') {
            res = '&gt;';
        }
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

Util.dumpspan = function(mem, org, mode, transparent) {
    var result = "";
    var nonempty = false;
    var conv = mode ? Util.char8 : Util.hex8;

    if (mem[org] === undefined) return false;

    for (var i = org; i < org+16; i++) {
        if (mem[i] !== undefined) nonempty = true;
        if (mode == 1) {
            result += conv(mem[i], transparent);
        } else {
            result += (i > org && i%8 === 0) ? "-" : " ";
            if (mem[i] === undefined) {                                    
                result += '  ';
            } else {
                result += conv(mem[i], transparent);
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

Util.infoclick_wrapper = function(cb)
{
    return function(e) {
        if (e.target.className === "bi") {
            var fake_e = {target: e.target.parentElement};
            cb(fake_e);
        } else {
            cb(e);
        }
    };
}

Util.dump = function(mem, title, pretitle, is_valid, info_cb, infoclick_cb,
    filename, startaddr, endaddr, krista)
{
    var org = 0;

    if (org % 16 !== 0) org = org - org % 16;

    var result = [];
    if (pretitle) {
        var pretit = document.createElement("pre");
        pretit.innerHTML = pretitle;
        result.push(pretit);
    }

    if (krista) {
        var kristakanvas = Util.krista_titlecanvas(mem);
        result.push(kristakanvas);
    }
    
    {
        var tit = document.createElement("pre");
        tit.innerHTML = title || "Raw tape dump:";
        result.push(tit);

        var dlbutton = document.createElement("span");
        dlbutton.innerHTML = "⬇";
        dlbutton.id = "dlbutton";
        dlbutton.classList.add("dlbutton");
        (function(filename, content, startaddr, endaddr) {
            dlbutton.addEventListener('click', function(e) {
                Util.download(filename, content, false, startaddr, endaddr);
            });
        })(filename||"tape.bin", mem, startaddr, endaddr);
        tit.appendChild(dlbutton);
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

        var span = this.dumpspan(mem, i, 0, true);    /* mode 0: hex */
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
                //p1.addEventListener("click", infoclick_cb, false);
                p1.addEventListener("click", 
                        Util.infoclick_wrapper(infoclick_cb), false);
            }
        }                                                                       
        if (span) {
            var text = Util.hex16(i) + ": ";
            text += span;
            text += '  ';
            text += this.dumpspan(mem, i, 1, true);   /* mode 1: characters */
            p1.innerText = text;
            p1.appendChild(this.dumpcanvas(mem, i));
            result.push(p1);

            if (!valid && info) {
                if (info) {
                    var binfo = document.createElement("pre");
                    binfo.setAttribute("class", "bi");
                    text = "Block: " + Util.hex8(info.blknum) + "." + info.sblknum;
                    text += " Read: " + Util.hex8(info.cs_read);
                    text += " Eval: " + Util.hex8(info.cs_calculated);
                    binfo.innerText = text;
                    p1.appendChild(binfo);
                }
            }
            lastempty = false;
        }
        if (!span && !lastempty) {
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

Util.download = function(filename, data, type, startaddr, endaddr) 
{
    if (filename) {
        var trim = 0;
        for (var i = filename.length - 1; i >= 0; --i) {
            if (filename.charCodeAt(i) <= 0x20) {
                trim += 1;
            } else {
                break;
            }
        }
        filename = filename.substring(0, filename.length - trim);
    }
    var a = document.createElement("a");
    var bytes = new Uint8Array(data.slice(startaddr || 0,
        endaddr ? endaddr + 1 : undefined));
    var file = new Blob([bytes], {type: type || "application/octet-stream"});
    if (window.navigator.msSaveOrOpenBlob) // IE10+
        window.navigator.msSaveOrOpenBlob(file, filename);
    else { // Others
        var url = URL.createObjectURL(file);
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);
    }
}

Util.fcb_to_83 = function(fcb) 
{
    var filename = "";
    var ext = "";
    for (var i = 0; i < 8; ++i) {
        if (fcb[i] > 0x20) {
            filename += String.fromCharCode(fcb[i]);
        } 
        else break;
    }

    for (var i = 8; i < 11; ++i) {
        if (fcb[i] > 0x20) {
            ext += String.fromCharCode(fcb[i]);
        } 
        else break;
    }

    return ext.length > 0 ? filename + "." + ext : filename;
}

Util.krista_titlecanvas = function(mem)
{
    var c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    c.setAttribute("class", "kristakanvas");
    var ctx = c.getContext("2d");
    ctx.translate(0.5, 0.5);

    var dat = ctx.getImageData(0, 0, 256, 256);
    var bmp = new Uint32Array(dat.data.buffer);

    var bofs = 0;
    for (var ofs = 0; ofs < 256*256/8; ++ofs) {
        var Y = mem[0x8000 + ofs] || 0;
        var r = mem[0xa000 + ofs] || 0;
        var g = mem[0xc000 + ofs] || 0;
        var b = mem[0xe000 + ofs] || 0;

        var x = Math.floor(ofs / 256);
        var y = 255 - (ofs % 256);

        var bo = x * 8 + y * 256;

        var pset = function(y,r,g,b,mask,bo) {
            bmp[bo]  = 0xff000000;
            bmp[bo] |= (r & mask) ? 0x00800000 : 0;
            bmp[bo] |= (g & mask) ? 0x00008000 : 0;
            bmp[bo] |= (b & mask) ? 0x00000080 : 0;
            bmp[bo] += (y & mask) ? 0x007f7f7f : 0;
        };
        pset(Y,r,g,b,0x80,bo+0);
        pset(Y,r,g,b,0x40,bo+1);
        pset(Y,r,g,b,0x20,bo+2);
        pset(Y,r,g,b,0x10,bo+3);
        pset(Y,r,g,b,0x08,bo+4);
        pset(Y,r,g,b,0x04,bo+5);
        pset(Y,r,g,b,0x02,bo+6);
        pset(Y,r,g,b,0x01,bo+7);
    }
    
    ctx.putImageData(dat, 0, 0);
    return c;
}


