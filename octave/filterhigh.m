#pkg load control
pkg load signal

clear all;
clf;

subplot(3,1,1)
wav = wavread("A01-Test-Mono.wav");
plot(wav(314300:315000));

f = fir1(32, 0.08, 'high');
bob=filter(f, 1, wav);
 
 subplot(3,1,2)
plot(bob(314300:315000));

file = fopen("coeffs.txt", "w");
fprintf(file, "A=\n");
fprintf(file, "%f,", f);

f2 = fir1(32, 0.04, 'high');
bob = filter(f2, 1, wav);
subplot(3,1,3);
plot(bob(314300:315000));
fprintf(file, "\nB=\n");
fprintf(file, "%f,", f2);

fclose(file);
