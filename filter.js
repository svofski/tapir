/** @constructor */

function Bypass()
{
}

Bypass.prototype.filter = function(x) 
{
    return x;
}

function Filter(coeffs)
{
    this.Coef = coeffs || Filter.A;
    this.n = 0;
    this.State = new Float64Array(this.Coef.length * 2);
}

/* fir1(32, 0.08, 'high') */
Filter.A = [
0.001174,0.001036,0.000856,0.000330,-0.000920,-0.003283,-0.007086,-0.012531,-0.019636,-0.028203,-0.037815,-0.047863,-0.057608,-0.066259,-0.073069,-0.077425,0.919812,-0.077425,-0.073069,-0.066259,-0.057608,-0.047863,-0.037815,-0.028203,-0.019636,-0.012531,-0.007086,-0.003283,-0.000920,0.000330,0.000856,0.001036,0.001174,
    ];

/* fir1(32, 0.04, 'high') */
Filter.B = [
-0.001472,-0.001819,-0.002589,-0.003859,-0.005673,-0.008037,-0.010915,-0.014233,-0.017874,-0.021694,-0.025522,-0.029176,-0.032472,-0.035240,-0.037332,-0.038635,0.962316,-0.038635,-0.037332,-0.035240,-0.032472,-0.029176,-0.025522,-0.021694,-0.017874,-0.014233,-0.010915,-0.008037,-0.005673,-0.003859,-0.002589,-0.001819,-0.001472,
];

Filter.prototype.filter = function(x)
{
    let len = this.Coef.length;
    let coef = this.Coef;
    let state = this.State; 
 
    /* state has two mirrors for more simple loop body */
    state[this.n] = state[len + this.n] = x;
    var j = this.n;
    if (++this.n >= len) {
        this.n = 0;
    }

    var accu = 0;
    for (var i = 0, end = len;;) {
        accu = accu + coef[i] * state[j++]; if (++i === end) break;
        accu = accu + coef[i] * state[j++]; if (++i === end) break;
        accu = accu + coef[i] * state[j++]; if (++i === end) break;
        accu = accu + coef[i] * state[j++]; if (++i === end) break;
        accu = accu + coef[i] * state[j++]; if (++i === end) break;
        accu = accu + coef[i] * state[j++]; if (++i === end) break;
        accu = accu + coef[i] * state[j++]; if (++i === end) break;
        accu = accu + coef[i] * state[j++]; if (++i === end) break;
    }
    accu = accu / len;
    accu *= 32;

    return accu;
}
