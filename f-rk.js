"use strict";

/** @constructor */
function RkBuf(mode)
{
    switch (mode) {
        case "Рк":
            this.Check = this.CheckРк;
            this.init = this.initBigend;
            break;
        case "Микроша":
            this.Check = this.CheckМикроша;
            this.init = this.initBigend;
            break;
        case "Специалистъ":
            this.Check = this.CheckСпециалистъ;
            this.init = this.initLittlend;
            break;
        case "ВекторДОС":
            this.Check = this.CheckВекторДОС;
            this.init = this.initBigend;
            break;
    }
}

RkBuf.prototype.initBigend = function(o1, o2, o3, o4)
{
    this.start = (o1 << 8) | o2;
    this.end = (o3 << 8) | o4;
}

RkBuf.prototype.initLittlend = function(o1, o2, o3, o4)
{
    return this.initBigend(o2, o1, o4, o3);
}

RkBuf.prototype.Init = function(o1, o2, o3, o4)
{
    this.init(o1, o2, o3, o4);
    this.count = this.end - this.start + 1;
    this.index = 0;
    if (this.count > 0) {
        this.buf = new Uint8Array(this.count);
    }
    this.csm_hi = this.csm_lo = 0;
    this.cs_hi = this.cs_lo = 0;
    this.cs_vectordos = 0;
}

RkBuf.prototype.Put = function(octet)
{
    if (this.index >= this.count || !this.buf) {
        return false;
    }

    this.buf[this.index] = octet;

    this.cs_lo += octet;
    if (this.index < this.count - 1) {
        this.cs_hi += octet + ((this.cs_lo >> 8) & 0xff);
    }
    this.cs_lo &= 0xff;
    this.cs_hi &= 0xff;

    /* Necrosha checksum */
    if (this.index % 2 === 0) {
        this.csm_lo ^= octet;
    } else {
        this.csm_hi ^= octet;
    }

    this.cs_vectordos = (this.cs_vectordos + octet) & 0xff;

    ++this.index;

    return this.count - this.index;
}

RkBuf.prototype.CheckРк = function(hi, lo) {
    return this.cs_hi === hi && this.cs_lo === lo;
}

RkBuf.prototype.CheckМикроша = function(hi, lo) {
    return this.csm_hi === hi && this.csm_lo === lo;
}

RkBuf.prototype.CheckСпециалистъ = function(hi, lo) {
    return this.cs_hi === lo && this.cs_lo === hi;
}

RkBuf.prototype.CheckВекторДОС = function(hi, lo) {
    return this.cs_vectordos === hi;
}


/** @constructor */
function FRk(rkbuf, name, maxconfidence, savedos)
{
    /* confidence is variable to allow microsha to overrule rk */

    this.FormatName = name;
    this.rk = rkbuf;
    this.maxconfidence = maxconfidence; 
    this.reset();
    if (savedos) {
        this.savedos = {};
        this.savedos.name = new Uint8Array(11);
        this.savedos.nameidx = 0;
    }
}

FRk.prototype.reset = function()
{
    this.start = this.end = this.cs = false;
    this.mem = [];
    this.confidence = 0;
    this.state = 0;
    this.s = false;
    this.x = {};
    this.bm = new Blockmap();
    this.bm.Init(0);
}

FRk.prototype.Confidence = function()
{
    return this.confidence;
}

FRk.prototype.eatoctet = function(sym, sym_start, sym_end)
{
    var resync = false;
    this.errormsg = false;
    if (this.confidence < -1000) {
        this.errormsg = FORMAT_GAVE_UP;
        return false;
    }

    if (!this.rawdump) {
        this.rawdump = new Uint8Array(80000);
        this.rawidx = 0;
    }
    this.rawdump[this.rawidx++] = sym;

    switch (this.state) {
        case 0: /* waiting for the sync */
            if (sym === 0xe6) {
                ++this.confidence;
                this.dummycount = 0;
                this.buf = new Uint8Array(32);
                this.state = 1;

                this.bm.Region(0, sym_start, sym_end, "sync")
                    .text = "SYNC";
            }
            break;
        case 1: /* start addr octet 0 */
            this.buf[this.dummycount] = sym;

            switch (this.dummycount) {
                case 0: this.x.o1 = sym_start; break;
                case 1: this.x.o2 = sym_start; break;
                case 2: this.x.o3 = sym_start; break;
                case 3: this.x.o4 = sym_start; this.x.o5 = sym_end; break;
                        break;
            }
            ++this.dummycount;
            if (this.dummycount === 4) {
                /* RK: start16, end16 big endian */
                this.rk.Init(this.buf[0], this.buf[1],
                        this.buf[2], this.buf[3]); 

                if (this.rk.count <= 0) {
                    this.reset();
                    resync = true;
                    this.state = 0;
                } else {
                    /* Can only keep on and hope that the checksum adds up */
                    ++this.confidence;
                    this.state = 2;
                }
            }
            break;
        case 2:
            if (this.rk.Put(sym) === 0) {
                this.mem = [];
                for (var i = this.rk.start; i <= this.rk.end; ++i) {
                    this.mem[i] = this.rk.buf[i - this.rk.start];
                }
                this.state = 2.5;
            }
            break; 
        case 2.5:
            this.x.cs_start = sym_start;
            this.csm_hibuf = sym;
            this.state = 2.75;
            if (this.savedos) {
                if (this.rk.Check(sym,-1)) {
                    this.confidence += 100;
                } else {

                }
                this.state = 2.52;
            }
            break;
        case 2.52:
            // Vector-06c/SAVEDOS postamble
            this.savedos.name[this.savedos.nameidx++] = sym; 
            this.confidence += 10 * (sym >= 0x20 && sym < 0x80);
            if (this.savedos.nameidx === 11) {
                this.errormsg = "Filename: [" + String.fromCharCode.apply(null, this.savedos.name) + "]";
                this.state = 100500;
            }
            break;
        case 2.75:
            this.x.cs_end = sym_end;
            this.csm_lobuf = sym;
            if (this.rk.Check(this.csm_hibuf, this.csm_lobuf)) {
                this.confidence += 400;
                this.state = 100500;
            } else {
                this.state = 3;
            }
            break;
        case 3:
            if (sym === 0xe6) {
                this.confidence += 100; 
                this.cs_hibuf = this.cs_lobuf = 0;
                this.state = 4;

                this.x.sync2_start = sym_start;
                this.x.sync2_end = sym_end;
            }
            break;
        case 4:
            this.cs_hibuf = sym;
            this.state = 5;
            this.x.cs_start = sym_start;
            break;
        case 5:
            this.cs_lobuf = sym;
            if (this.rk.Check(this.cs_hibuf, this.cs_lobuf)) {
                this.confidence += 200;
                this.state = 100500;
            } 
            else {
                this.errormsg = "checksum mismatch";
                this.state = 100;
            }

            this.bm.Region(0, this.x.o1, sym_end, "block");
            this.bm.Region(0, this.x.o1, this.x.o5, "name");
            this.bm.Region(0, this.x.o1, this.x.o2, "section-byte-alt")
                .text = Util.hex8(this.buf[0]);
            this.bm.Region(0, this.x.o2, this.x.o3, "section-byte-alt")
                .text = Util.hex8(this.buf[1]);
            this.bm.Region(0, this.x.o3, this.x.o4, "section-byte-alt")
                .text = Util.hex8(this.buf[2]);
            this.bm.Region(0, this.x.o4, this.x.o5, "section-byte-alt")
                .text = Util.hex8(this.buf[3]);
            this.bm.Region(0, this.x.o5, this.x.sync2_start, "payload")
                .text = "DATA @" + Util.hex16(this.rk.start) + 
                " [" + this.rk.buf.length + "]";
            this.bm.Region(0, this.x.sync2_start, this.x.sync2_end, "sync")
                .text = "SYNC";
            this.bm.Region(0, this.x.cs_start, sym_start, "section-cs0")
                .text = "=" + Util.hex8(this.cs_hibuf);
            this.bm.Region(0, sym_start, sym_end, "section-cs1")
                .text = Util.hex8(this.cs_lobuf) + "=";
            break;
        case 100:
            break;
        case 100500:
           break;
    }
}

FRk.prototype.dump = function(wav, cas)
{
    return (function(that) {
        var append = that.savedos ? "  Имя: [" + 
            String.fromCharCode.apply(null, that.savedos.name) + "]" : "";
        //return Util.dump(that.rawdump.slice(0,that.rawidx-1), that.FormatName + ": " + 
        return Util.dump(that.mem, that.FormatName + ": " + 
                Math.round(that.confidence/that.maxconfidence*100) + "%" + append,
                false,
                /* is_valid(addr) */
                null,
                /* info_cb(addr) */
                null,
                /* navigate to */
                null);
    })(this);
}

FRk.prototype.GetDecor = function(cas)
{
    return this.bm.GetDecor(cas);
}

function NewFRk86()
{
    return new FRk(new RkBuf("Рк"), "Радио-86РК", 302);
}

function NewFMicrosha()
{
    return new FRk(new RkBuf("Микроша"), "Микроша", 402);
}

function NewFSpec() {
    return new FRk(new RkBuf("Специалистъ"), "Специалистъ", 402);
}

function NewFVectorDOS() {
    return new FRk(new RkBuf("ВекторДОС"), "Вектор-06ц SAVEDOS", 212, 1);
}
