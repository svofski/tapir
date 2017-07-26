/** @constructor */
function FKrista()
{
    this.FormatName = "Криста-2";
    this.reset();
    this.confidence = 0;
}

FKrista.prototype.Confidence = function()
{
    return this.confidence;
}

FKrista.prototype.reset = function()
{
    this.state = 0;
    this.mem = [];
    this.blockmap = [];
    for (var i = 0; i < 256; ++i) {
        this.blockmap[i] = [0, -1, -1];
    }
}

FKrista.prototype.eatoctet = function(sym)
{
    var resync = false;
    this.errormsg = "";
    switch (this.state) {
        case 0:
            /* Nothing yet, waiting for the first sync/header */
            if (sym === 0xe6) {
                ++this.confidence;
                this.state = 1;
            }
            break;
        case 1:
            /* After the first sync byte, 0xff */
            if (sym === 0xff) {
                ++this.confidence;
                this.state = 2;
                this.checksum = 0;
            } else {
                this.reset();
                this.confidence -= 100;
            }
            break;
        case 2:
            /* Expect start address */
            this.startaddr = sym;
            this.checksum += sym;
            this.state = 3;
            break;
        case 3:
            /* Expect end address */
            this.endaddr = sym;
            this.checksum += sym;
            this.state = 4;
            break;
        case 4:
            /* Expect header checksum */
            if (this.checksum === sym) {
                this.confidence += 100;
                resync = true;
                this.state = 5; /* local resync to e6 */

                for (var i = this.startaddr; i < this.endaddr; ++i) {
                    this.blockmap[i][0] = 1;
                }
            } else {
                this.errormsg = "Checksum error: calculated=" + 
                    Util.hex8(this.checksum) + 
                    " Decoded=" + Util.hex8(sym);
                this.reset();
                this.confidence -= 30;
            }
            break;
        case 5:
            /* Expect new header */
            if (sym === 0xe6) {
                this.state = 6;
                this.H = this.L = this.Count = undefined;
                this.confidence++;
            }
            break;
        case 6:
            /* H, L, length */
            if (this.H === undefined) this.H = sym;
            else if (this.L === undefined) this.L = sym;
            else {
                this.Addr = (this.H << 8) || this.L;
                this.Count = (0377 & (sym - 1)) + 1;
                this.CountFixed = this.Count;
                this.state = 7;
                this.checksum = 0;

                //console.log("Loading KRISTA-2 Block to: " + Util.hex8(this.H) +
                //        Util.hex8(this.L) + " Count=" + this.Count);
            }
            break;
        case 7:
            /* Data payload */
            this.mem[this.Addr++] = sym;
            this.checksum = (this.checksum + sym) & 0377;
            --this.Count;
            if (this.Count === 0) this.state = 8;
            break;
        case 8:
            /* Payload checksum */
            if (this.checksum !== sym) {
                this.errormsg = "Payload checksum error in block: " +
                    Util.hex8(this.H) + Util.hex8(this.L) + "[" + this.CountFixed +
                    "] Calculated=" + Util.hex8(this.checksum) + " Read=" +
                    Util.hex8(sym);
                resync = true;
                this.state = 5;
                this.blockmap[this.H][1] = sym;
                this.blockmap[this.H][2] = this.checksum;
            } else {
                /* Payload OK, expect next block */
                this.blockmap[this.H][0] = 0;
                this.blockmap[this.H][1] = this.checksum;
                this.blockmap[this.H][2] = this.checksum;

                var yet = 0;
                for (var i = 0; i < 256; ++i) {
                    yet += this.blockmap[i][0];
                }
                /* If more blocks left to load, resync and load next */
                if (yet) {
                    resync = true;
                    this.state = 5;
                } else {
                    /* Otherwise be happy and just ignore everything forevah */
                    this.state = 100500;
                }
            }
            break;
        case 100500:
            break;
    }
    if (this.confidence < -1000) {
        this.errormsg = FORMAT_GAVE_UP;
    }
    return resync;
}

FKrista.prototype.dump = function()
{
    var happiness = (this.state === 100500 ? "HAPPY" : "SAD");
    var i0 = "<pre class='d0'>Krista-2 decoder result: " +
            happiness + 
            " Confidence: " + this.confidence +
            "</pre><br/>";

    var i1 = "<pre class='d1'>Load addresses: " + Util.hex16(this.startaddr) + 
        " through " + Util.hex16(this.endaddr) + "</pre><br/>";

    var i2 = "";
    for (var i = 0; i < 256; ++i) {
        if (this.blockmap[i][0]) {
            i2 += '<pre class="d' + (i%2) + '">'; 
            i2 += "[" + Util.hex8(i) + "] ";

            if (this.blockmap[i][1] === -1) {
                i2 += "MISSING";
            } else {
                "Checksum: expected=" + Util.hex8(this.blockmap[i][1]) + 
                    " actual=" + Util.hex8(this.blockmap[i][2]);
            }
            i2 += "<br/>";
        }
    }
    if (i2.length > 0) {
        i2 = "<pre class='d0'>Blocks that were not loaded:</pre><br/>" + i2;
    }

    return Util.dump(this.mem, "Krista-2 result: " + happiness,
            i0 + i1 + i2);
};

FKrista.prototype.GetDecor = function()
{
    return null;
};
