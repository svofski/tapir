"use strict";

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
    this.bm = new Blockmap();
    this.x = {}; /* temporary stash for symbol positions */
}

FKrista.prototype.eatoctet = function(sym, sym_start, sym_end)
{
    var resync = false;
    this.errormsg = "";
    switch (this.state) {
        case 0:
            /* Nothing yet, waiting for the first sync/header */
            if (sym === 0xe6) {
                ++this.confidence;
                this.state = 1;

                this.x.sync_start = sym_start;
                this.x.sync_end = sym_end;
            }
            break;
        case 1:
            /* After the first sync byte, 0xff */
            if (sym === 0xff) {
                ++this.confidence;
                this.state = 2;
                this.checksum = 0;
                this.x.header_start = sym_start;
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
                this.bm.Init(null, this.startaddr, this.endaddr - this.startaddr - 1);
                this.x.header_end = sym_end;

                var bnum = this.startaddr;
                this.bm.Region(bnum, this.x.sync_start, this.x.sync_end, "sync");
                this.bm.Region(bnum, this.x.header_start, this.x.header_end, "name");
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
                this.x.sync_start = sym_start;
                this.x.sync_end = sym_end;
            }
            break;
        case 6:
            /* H, L, length */
            if (this.H === undefined) {
                this.x.block_start = sym_start;
                this.x.header_start = sym_start;
                this.H = sym;
            } else if (this.L === undefined) this.L = sym;
            else {
                this.Addr = (this.H << 8) || this.L;
                this.Count = (0xff & (sym - 1)) + 1;
                this.CountFixed = this.Count;
                this.state = 7;
                this.checksum = 0;
                this.x.header_end = sym_end;
                this.x.payload_start = sym_end + 1;
                //console.log("Loading KRISTA-2 Block to: " + Util.hex8(this.H) +
                //        Util.hex8(this.L) + " Count=" + this.Count);
            }
            break;
        case 7:
            /* Data payload */
            this.mem[this.Addr++] = sym;
            this.checksum = (this.checksum + sym) & 0xff;
            --this.Count;
            if (this.Count === 0) {
                this.state = 8;
                this.x.payload_end = sym_end;
            }
            break;
        case 8:
            /* Payload checksum */
            this.bm.Init(this.H);
            this.x.cs_start = sym_start;
            this.x.cs_end = sym_end;
            this.x.block_end = sym_end;

            if (this.checksum !== sym) {
                this.errormsg = "Payload checksum error in block: " +
                    Util.hex8(this.H) + Util.hex8(this.L) + "[" + this.CountFixed +
                    "] Calculated=" + Util.hex8(this.checksum) + " Read=" +
                    Util.hex8(sym);
                resync = true;
                this.state = 5;
                this.bm.Init(this.H);
                this.bm.MarkFailure(this.H, this.checksum & 0xff, sym & 0xff);
            } else {
                /* Payload OK, expect next block */
                console.log("OK block at: " + Util.hex8(this.H) + Util.hex8(this.L));
                this.bm.MarkLoaded(this.H, sym & 0xff, sym & 0xff);

                var yet = this.bm.CountMissing();
                /* If more blocks left to load, resync and load next */
                if (yet) {
                    resync = true;
                    this.state = 5;
                } else {
                    /* Otherwise be happy and just ignore everything forevah */
                    this.state = 100500;
                }
            }

            this.bm.Region(this.H, this.x.sync_start, this.x.sync_end, "sync");
            this.bm.Region(this.H, this.x.block_start, this.x.block_end, "block");
            this.bm.Region(this.H, this.x.header_start, this.x.header_end, "name");
            this.bm.Region(this.H, this.x.payload_start, this.x.payload_end, "payload",
                    this.checksum !== sym);
            this.bm.Region(this.H, this.x.cs_start, this.x.cs_end, "section-cs0");

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
    this.bm.ForEach(function(loaded, cs1, cs2, marks) {
        if (!loaded === 0) {
            i2 += '<pre class="d' + (i%2) + '">'; 
            i2 += "[" + Util.hex8(i) + "] ";

            if (cs1 === -1) {
                i2 += "MISSING";
            } else {
                i2 += "Checksum: act: " + Util.hex8(cs1) + 
                    " read: " + Util.hex8(cs2);
            }
            i2 += "<br/>";
        }
    });
    if (i2.length > 0) {
        i2 = "<pre class='d0'>Blocks that were not loaded:</pre><br/>" + i2;
    }

    return Util.dump(this.mem, "Krista-2 result: " + happiness,
            i0 + i1 + i2);
};

FKrista.prototype.GetDecor = function(cas)
{
    return this.bm.GetDecor(cas);
};
