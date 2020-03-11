@echo off
:loop
set /p inFile=Path/Name of source WAV file: 
set /p inRule=Path/Name of source rule file: 
set /p output=Path/Name of output WAV file: 
node.exe skipper.js "%inFile%" "%inRule%" "%output%" --max-old-space-size=8192
pause
cls
goto loop
exit