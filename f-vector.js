/** @constructor */
function NameBlock(start, count, blocknum, cs0, nb)
{
    this.Start = start || undefined;
    this.Count = count || undefined;
    this.Blocknum = blocknum || undefined;
    this.Checksum = cs0 || undefined;
    this.NameBytes = nb || new Uint8Array(25);
}

NameBlock.prototype.Addr = function(sub)
{
    var addr = (this.Start + this.Count - this.Blocknum) << 8;
    if (sub) {
        addr += (sub & 7) << 5;
    }
    return addr;
}

NameBlock.prototype.NameStr = function()
{
    return String.fromCharCode.apply(String, this.NameBytes);
}

/** @constructor */
function FVector()
{
    this.FormatName = "Вектор-06ц";
    this.reset();
}

FVector.prototype.reset = function()
{
    this.confidence = 0;
    this.state = 0;
    this.mem = [];
    this.blockmap = undefined;
    this.cs0 = 0;
    this.checksum = 0;

    this.NameBlock = undefined;

    this.Block_sym_start = 0;
    this.Block_sym_end = 0;
    this.Sblk_sym_start = 0;
    this.Sblk_sym_end = 0;
}

FVector.prototype.Confidence = function()
{
    return this.confidence;
}

FVector.prototype.region = function(blknum, start, end, type, error)
{
    var region = {
        sblk_sym_start: start,
        sblk_sym_end:   end,
        type: type,
        error: error,
    };
    this.blockmap[blknum][3].push(region);
    return region;
}

FVector.prototype.eatoctet = function(sym, sym_start, sym_end)
{
    var resync = false;
    this.errormsg = "";
    if (this.confidence < -1000) {
        console.log("Вектор-06ц сдался");
        this.errormsg = FORMAT_GAVE_UP;
        return false;
    }
    switch (this.state) {
        case 0:
            /* waiting for the sync */
            if (sym === 0xe6) {
                ++this.confidence;
                this.state = 1;
                this.dummycount = 0;
                this.Block_sym_start = sym_start;
                this.Block_sym_end = 0;
                this.Sblk_sym_start = sym_end;
                this.Sblk_sym_end = 0;
                this.Sync_start = sym_start;
                this.Sync_end = sym_end;
            }
            break;
        case 1:
            if (sym === 0) {
                /* Name subblock a'coming */
                this.cs0 = 0;
                ++this.confidence;
                this.tmpNameBlock = new NameBlock();
                this.tmpNameBlock.sym_start = sym_start;
                this.BlockBlock = undefined;
                if (++this.dummycount == 4) {
                    this.state = 2;
                    this.dummycount = 0;
                    this.name_sym_start = sym_end;
                }
            } else if ((sym & 0x80) === 0x80 && this.NameBlock) {
                /* Regular payload subblock */
                this.checksum = 0;
                this.checksum += this.sblk = sym;
                this.SblkAddr = this.NameBlock.Addr(sym);
                this.sblk_sym_start = sym_start;
                this.state = 9;
            } else {
                this.confidence -= 100;
                this.errormsg = "Unexpected subblock number: " + Util.hex8(sym);
                this.state = 0;
                resync = true;
            }
            break;
        case 2:
            /* Expect name */
            this.cs0 += this.tmpNameBlock.NameBytes[this.dummycount++] = sym;
            if (this.dummycount === 27) {
                this.state = 3;
                this.name_sym_end = sym_end;
            }
            ++this.confidence;
            break;
        case 3:
            /* High nibble of load address */ 
            this.cs0 += this.tmpNameBlock.Start = sym;
            this.start_sym_start = sym_start;
            ++this.confidence;
            this.state = 4;
            break;
        case 4:
            /* Block count total */
            this.cs0 += this.tmpNameBlock.Count = sym;
            this.count_sym_start = sym_start;
            ++this.confidence;
            this.state = 5;
            break;
        case 5:
            /* Block number */
            this.cs0 += this.tmpNameBlock.Blocknum = sym;
            this.blknum_sym_start = sym_start;
            this.cs0 &= 0377;
            ++this.confidence;
            this.state = 6;
            break;
        case 6:
            /* END OF NAME SUBBLOCKЪ */
            this.cs0_sym_start = sym_start;
            /* Checksum 0 */
            if (this.cs0 === sym) {
                this.confidence += 100;
                this.NameBlock = this.tmpNameBlock;
                this.initBlockMap();
            } else {
                this.confidence -= 100;
                this.errormsg = "CS0 Expected=" + Util.hex8(this.cs0) + 
                    " Found=" + Util.hex8(sym);
            }
            this.Sblk_sym_end = sym_end;
            this.state = 0;
            resync = true;
            {
                var nb = this.tmpNameBlock;
                let blknum = nb.Addr(0) >> 5;
                this.initBlockMap(blknum);
                /* Push SYNC marking */
                this.region(blknum, this.Sync_start, this.Sync_end, "sync");
                /* Push BLOCK marking */
                this.BlockBlock = this.region(blknum, this.Sync_end, 0, "block");
                /* Push main block marking */
                this.region(blknum, this.Sblk_sym_start, this.Sblk_sym_end,
                        "name", !(this.cs0 === sym));
                /* Push name region */
                this.region(blknum, this.name_sym_start, this.name_sym_end,
                        "section-name", false);
                this.region(blknum, this.start_sym_start, this.count_sym_start,
                        "section-byte-alt", false);
                this.region(blknum, this.count_sym_start, this.blknum_sym_start,
                        "section-byte-alt", false);
                this.region(blknum, this.blknum_sym_start, this.cs0_sym_start,
                        "section-byte-alt", false);
                this.region(blknum, this.cs0_sym_start, sym_end,
                        "section-cs0", false);
            }
            break;
        case 9:
            /* BEGINЪ OF PAYLOAD SUBBLOCK (32 octets) */
            var cs0_tape;
            this.checksum += cs0_tape = sym;
            this.confidence += 100 * (cs0_tape === this.cs0);
            this.state = 10;
            this.dummycount = 0;
            this.cs0_sym_start = sym_start;
            this.cs0_sym_end = sym_end;
            break;
        case 10:
            this.mem[this.SblkAddr + this.dummycount] = sym;
            this.checksum += sym;
            ++this.dummycount;
            if (this.dummycount == 32) {
                this.state = 11;
            }
            break;
        case 11:
            /* END OF PAYLOAD SUBBLOCKЪ */
            /* Regardless of everything, update block end */
            if (this.BlockBlock) {
                this.BlockBlock.sblk_sym_end = sym_end;
            }
            this.Sblk_sym_end = sym_end;

            let blknum = this.SblkAddr >> 5;
            let checksum_ok = (this.checksum & 0377) === sym;
            if (checksum_ok) {
                this.state = 0;
                this.confidence += 100;

                this.initBlockMap(blknum);
                /* Clear the subblock in the block map */
                if (this.blockmap[blknum][0] < -1) {
                    console.log("FIXED BLOCK @", 
                            Util.hex16(this.SblkAddr));
                }
                this.blockmap[blknum][0] = 0;
            } else {
                this.errormsg = "Payload checksum mismatch: @" +
                    Util.hex16(this.SblkAddr) + 
                    " sblk=" + Util.hex8(this.sblk) + 
                    " calculated=" + Util.hex8(this.checksum & 0377) +
                    " read=" + Util.hex8(sym);
                this.state = 0;
                this.confidence -= 100;
                if (this.blockmap && this.blockmap[blknum]) {
                    this.blockmap[blknum][1] = this.checksum & 0377;
                    this.blockmap[blknum][2] = sym & 0377;
                    --this.blockmap[blknum][0];
                }
            }

            this.initBlockMap(blknum);
            /* Push SYNC marking */
            this.region(blknum, this.Sync_start, this.Sync_end, "sync");

            /* Push main block marking */
            this.region(blknum, this.Sblk_sym_start, this.Sblk_sym_end, "payload",
                !checksum_ok).variant = this.sblk & 7;
            /* SBLK marking */
            this.region(blknum, this.sblk_sym_start, this.cs0_sym_start, 
                    "section-byte-alt");
            /* CS0 marking */
            this.region(blknum, this.cs0_sym_start, this.cs0_sym_end, "section-cs0");
            resync = true;
            break;
        case 100500:
            break;
    }
    return resync;
}

FVector.prototype.countSuccess = function()
{
    if (!this.NameBlock) {
        return 0;
    }
    var faltas = 0;
    for (var i = this.NameBlock.Start * 8; 
            i < (this.NameBlock.Start + this.NameBlock.Count) * 8; ++i) {
        faltas += this.blockmap[i][0] ? 1 : 0;
    }
    return 1 - faltas / (this.NameBlock.Count * 8);
}

FVector.prototype.dump = function(wav, cas)
{
    if (!this.NameBlock) {
        var rien = document.createElement("pre");
        rien.innerHTML = this.FormatName + " ничего полезного не распознал";
        return rien;
    }
    var happiness = Math.round(this.countSuccess() * 100) + "% ништяк";
    var i0 = "<pre class='dt'>Вектор-06ц decoder result: " +
            happiness + 
            " Confidence: " + this.confidence +
            "</pre><br/>";

    var startaddr = this.NameBlock.Start << 8;
    var endaddr = ((this.NameBlock.Start + this.NameBlock.Count) << 8) - 1;
    var i1 = "<pre class='dt'>Load addresses: " + 
        Util.hex16(startaddr) +
        " through " + Util.hex16(endaddr) +
        "</pre><br/>";
    i1 += "<pre class='dt'>File name: " + this.NameBlock.NameStr() + "</pre><br/>";

    return (function(that) {
        return Util.dump(that.mem, "Вектор-06ц result: " + happiness,
            i0 + i1,
            function(addr) {
                var blknum = addr >> 5;
                return that.blockmap[blknum] && that.blockmap[blknum][0] === 0; 
            },
            function(addr) {
                if ((addr & 037) != 0) return false;
                var blknum = addr >> 5;
                if (that.blockmap[blknum]) {
                    return {
                        blknum: blknum >> 3, 
                        sblknum: blknum & 7,
                        cs_calculated: that.blockmap[blknum][1],
                        cs_read: that.blockmap[blknum][2]
                    };
                }
            },
            function(e) {
                var blknum = parseInt(e.target.getAttribute("blk")) << 3;
                blknum += parseInt(e.target.getAttribute("sblk"));
                var list = that.blockmap[blknum][3];
                for (var i in list) {
                    var b = list[i];
                    if (b.type === "name" || b.type === "payload") {
                        var iin = b.sblk_sym_start;
                        var out = b.sblk_sym_end;
                        wav.setNeedle(cas.IntervalToSample(iin));
                    }
                }
            }
            );
    })(this);
};

FVector.prototype.initBlockMap = function(single)
{
    if (!this.blockmap) {
        this.blockmap = [];
    }

    if (single !== undefined && this.blockmap[single] === undefined) {
        this.blockmap[single] = [-1, -1, -1, []];
    } else {
        var start = this.NameBlock.Start * 8;
        var end = (this.NameBlock.Start + this.NameBlock.Count) * 8;
        //console.log("Expecting blocks " + start + " through " + end);
        for (var i = start; i <= end; ++i) {
            /*  OK, checksum calc, checksum tape, {} */
            if (this.blockmap[i] === undefined) {
                this.blockmap[i] = [-1, -1, -1, []];
            }
        }
    }
}

FVector.prototype.GetDecor = function(cas)
{
    var decor = [];
    for (var i in this.blockmap) {
        var marks = this.blockmap[i][3];
        for (var j in marks) {
            var m = marks[j];
            var kolor = "#00f";
            var height = 0.5;
            switch (m.type) {
                case "name":
                    if (m.error) {
                        kolor = "#f88";
                    } else {
                        kolor = "#099";
                    }
                    nest = 2;
                    break;
                case "section-name":
                    kolor = "#119";
                    nest = 4;
                    break;
                case "section-byte-alt":
                    if (this.altbytecount === undefined) this.altbytecount = 0;
                    kolor = (this.altbytecount & 1) ? "#536" : "#359";
                    ++this.altbytecount;
                    nest = 4;
                    break;
                case "section-cs0":
                    kolor = "#b44";
                    nest = 4;
                    break;
                case "payload":
                    if (m.error) {
                        kolor = "#b00";
                    } else {
                        var r = 3 + ((7 - m.variant) >> 2)
                        var g = ((m.variant & 1) << 1);
                        var b = 7 + (m.variant >> 2);
                        kolor = "#" + r.toString(16) + g.toString(16) + b.toString(16);
                    }
                    nest = 2;
                    break;
                case "sync":
                    kolor = "#b61";
                    nest = 0;
                    break;
                case "block":
                    kolor = "#753";
                    nest = 0;
                    break;
            }
            var region = 
                {
                    begin: cas.IntervalToSample(m.sblk_sym_start),
                    end: cas.IntervalToSample(m.sblk_sym_end),
                    color: kolor,
                    nest: nest,
                };
            decor.push(region);
        }
    }
    return decor;
}
