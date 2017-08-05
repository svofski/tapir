/** @constructor */

function Blockmap()
{
    this.blockmap = [];
}

Blockmap.prototype.Region = function(blknum, start, end, type, error)
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

Blockmap.prototype.MarkLoaded = function(blknum) 
{
    this.blockmap[blknum][0] = 0;
}

Blockmap.prototype.MarkFailure = function(blknum, cs1, cs2)
{
    if (this.blockmap[blknum]) {
        --this.blockmap[blknum][0];
        this.blockmap[blknum][1] = cs1;
        this.blockmap[blknum][2] = cs2;
    }
}

Blockmap.prototype.IsFailure = function(blknum)
{
    return this.blockmap[blknum] && this.blockmap[blknum][0] < -1;
}

Blockmap.prototype.Init = function(single, start, count)
{
    if (!this.blockmap) {
        this.blockmap = [];
    }

    if (single !== undefined && single !== null && this.blockmap[single] === undefined){
        this.blockmap[single] = [-1, -1, -1, []];
    } else if (start !== undefined && count !== undefined) {
        for (var i = start; i < start + count; ++i) {
            /*  OK, checksum calc, checksum tape, {} */
            if (this.blockmap[i] === undefined) {
                this.blockmap[i] = [-1, -1, -1, []];
            }
        }
    }
}

Blockmap.prototype.CountMissing = function()
{
    var faltas = 0;
    for (var i in this.blockmap) {
        if (this.blockmap[i]) {
            faltas += this.blockmap[i][0] ? 1 : 0;
        }
    }
    return faltas;
}

Blockmap.prototype.IsLoaded = function(blknum)
{
    return this.blockmap[blknum] && this.blockmap[blknum][0] === 0;
}

Blockmap.prototype.InfoObject = function(blknum)
{
    if (this.blockmap[blknum]) {
        return {
            blknum: blknum >> 3, 
            sblknum: blknum & 7,
            cs_calculated: this.blockmap[blknum][1],
            cs_read: this.blockmap[blknum][2]
        };
    }
    return false;
}

Blockmap.prototype.KrinfoObject = function(blknum)
{
    if (this.blockmap[blknum]) {
        return {
            blknum: blknum,
            sblknum: 0,
            cs_calculated: this.blockmap[blknum][1],
            cs_read: this.blockmap[blknum][2]
        };
    }
    return false;
}

Blockmap.prototype.GetRegions = function(blknum, type)
{
    var list = this.blockmap[blknum][3];
    if (!type) return list;

    var result = [];
    for (var i in list) {
        var b = list[i];
        if (b.type === type) {
            result.push(b);
        }
    }
    return result;
}

Blockmap.prototype.ForEach = function(f) {
    for (var i in this.blockmap) {
        f(this.blockmap[i][0], this.blockmap[i][1], this.blockmap[i][2],
                this.blockmap[i][3]);
    }
}

Blockmap.prototype.GetDecor = function(cas)
{
    var decor = [];
    var that = this;

    this.ForEach(function(v0, v1, v2, marks) {
        for (var j in marks) {
            var m = marks[j];
            var kolor = "#00f";
            var height = 0.5;
            var nest;
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
                    if (that.altbytecount === undefined) that.altbytecount = 0;
                    kolor = (that.altbytecount & 1) ? "#536" : "#359";
                    ++that.altbytecount;
                    nest = 4;
                    break;
                case "section-cs0":
                    kolor = "#b44";
                    nest = 4;
                    break;
                case "section-cs1":
                    kolor = "#b33";
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
                    //kolor = "#753";
                    kolor = "#573";
                    nest = 0;
                    break;
            }
            var region = 
                {
                    begin: cas.IntervalToSample(m.sblk_sym_start),
                    end: cas.IntervalToSample(m.sblk_sym_end),
                    color: kolor,
                    text: m.text,
                    nest: nest,
                };
            decor.push(region);
        }
    });

    return decor;
}
