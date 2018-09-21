"use strict";

/** @constructor */
function FVectorBsave()
{
    this.FormatName = "Вектор-06ц CAS/MON";
    this.confidence = 0;
    this.maxconfidence = 400;
    this.reset();
}

FVectorBsave.prototype.reset = function()
{
    this.confidence = 0;
    this.mem = [];
    this.count = 0;
    this.state = 0;
    this.bm = new Blockmap();
    this.bm.Init(0);
    this.FileName = "";
}

FVectorBsave.prototype.Confidence = function()
{
    return this.confidence;
}

FVectorBsave.prototype.eatoctet = function(sym, sym_start, sym_end)
{
    var resync = false;
    this.errormsg = false;
    if (this.confidence < -1000) {
        this.errormsg = FORMAT_GAVE_UP;
        return false;
    }
    switch (this.state) {
        case 0: /* waiting for the sync */
            if (sym === 0xe6) {
                this.confidence = 0;
                this.dummycount = 0;
                this.buf = new Uint8Array(32);
                this.state = 1;

                this.Header_sym_start = sym_end;
                this.Name_sym_start = -1;
                this.Name_sym_end = 0;

                this.bm.Region(0, sym_start, sym_end, "sync")
                    .text = "SYNC";

                this.bytemarks = [];
            }
            break;
        case 1: /* CAS/MON header magic: D2 D2 D2 D2 */
            if (sym === 0xd2) {
                this.bytemarks[this.dummycount] = [sym_start, sym_end, sym];
                ++this.dummycount;

                if (this.dummycount == 4) {
                    this.confidence += 100;
                    this.state = 2;
                }
            } else {
                this.confidence = -1001;
            }
            break;
        case 2: /* file name */
            ++this.dummycount;
            if (this.Name_sym_start == -1) {
                this.Name_sym_start = sym_start;
            }
            this.FileName += String.fromCharCode(sym)
            if (this.FileName.length >= 128) {
                this.confidence = -1001;
            }
            if (sym === 0x0) {
                this.dummycount = 1;
                this.state = 3;
            } else {
                this.Name_sym_end = sym_end;
            }
            break;
        case 3: /* end of header */
            if (sym === 0x0) {
                ++this.dummycount;
                if (this.dummycount === 3) {
                    this.state = 4;
                    this.confidence += 50;

                    /* create the header block */
                    this.bm.Region(0, this.Header_sym_start, sym_end,
                        "block");
                    this.bm.Region(0, this.Header_sym_start, sym_end,
                        "name");
                    for (var i = 0; i < this.bytemarks.length; ++i) {
                        this.bm.Region(0, this.bytemarks[i][0], 
                            this.bytemarks[i][1], "section-byte-alt").text = 
                            Util.hex8(this.bytemarks[i][2]);
                    }
                    this.bm.Region(0, this.Name_sym_start, this.Name_sym_end,
                        "section-name").text = this.FileName;
                }
            }
            break;
        case 4: /* mid-leader zeroes, ignore */
            this.state = 5;
            break;
        case 5:
            if (sym === 0xe6) {
                this.bm.Region(0, sym_start, sym_end, "sync")
                    .text = "SYNC";
                this.bytemarks = [];
                this.state = 6;
                this.dummycount = 0;
            }
            break;
        case 6: /* load start, load end (big endian) */
            if (this.dummycount == 0) {
                this.bm.Init(1);
                this.Blocknik = this.bm.Region(1,sym_start, 0, "block");
            }

            this.bytemarks[this.dummycount] = [sym_start, sym_end, sym];
            ++this.dummycount;

            if (this.dummycount == 4) {
                this.confidence += 150;
                this.state = 7;

                this.startaddr = ((this.bytemarks[0][2]<<8) & 0xff00) |
                    (this.bytemarks[1][2] & 0xff);
                this.endaddr = ((this.bytemarks[2][2]<<8) & 0xff00) |
                    (this.bytemarks[3][2] & 0xff);
                this.count = this.startaddr;

                this.checksum = 0;

                // add decorators here
                this.bm.Region(1, this.bytemarks[0][0], this.bytemarks[1][1],
                    "section-byte-alt").text = "START:" + 
                    Util.hex16(this.startaddr);
                this.bm.Region(1, this.bytemarks[2][0], this.bytemarks[3][1],
                    "section-byte-alt").text = "END:" + 
                    Util.hex16(this.endaddr);
            }
            break;
        case 7:  /* payload */
            this.mem[this.count] = sym;
            this.checksum = 0xff & (this.checksum + sym);
            
            if (this.count === this.endaddr) {
                this.state = 8; 
            } 
            ++this.count;
            break;
        case 8: /* checksum */
            console.log("czech sum=", Util.hex8(this.checksum));

            this.Blocknik.sblk_sym_end = sym_end;
            this.state = 100; // end;

            this.bm.Region(1, sym_start, sym_end, "section-cs0").text = 
                Util.hex8(this.bytemarks[0][2]);

            if (this.checksum === sym) {
                this.confidence += 100;
            } else {
                this.confidence -= 33;
                this.errormsg = "Checksum mismatch: read=" + 
                    Util.hex16(cs) + " actual=" + Util.hex16(this.checksum);
            }
            break;
        case 10: /* end of line  */
            
 
        case 100:
            break;
        case 100500:
           break;
    }
}

FVectorBsave.prototype.dump = function(wav, cas)
{
    return (function(that) {
        return Util.dump(that.mem, that.FormatName + ": " + 
                that.confidence/that.maxconfidence*100 + "%",
                false,
                /* is_valid(addr) */
                null,
                /* info_cb(addr) */
                null,
                /* navigate to */
                null,
                that.FileName);
    })(this);
}

FVectorBsave.prototype.GetDecor = function(cas)
{
    return this.bm.GetDecor(cas);
}


