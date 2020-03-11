@echo off
:loop
echo Just a warning, this one didn't turn out too well
node.exe skipper.js examples/kids-start-low.wav examples/rule-kids.txt "SM kids.wav" --max-old-space-size=8192
pause
cls
goto loop
exit