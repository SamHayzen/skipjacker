@echo off
:loop
node.exe skipper.js examples/wndrwll-start.wav examples/rule-wndrwll.txt "SM wonderwall.wav" --max-old-space-size=8192
pause
cls
goto loop
exit