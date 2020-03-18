@echo off
:loop
echo This one takes a lot of memory and a lot of time; it's a whole song
node.exe --max-old-space-size=8192 skipper.js examples/zone-low.wav examples/rule-zone.txt "SM in the zone.wav" --max-old-space-size=8192
pause
cls
goto loop
exit