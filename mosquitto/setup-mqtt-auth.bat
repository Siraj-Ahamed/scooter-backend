@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM setup-mqtt-auth.bat
REM Run this ONCE to create the Mosquitto password file.
REM Must be run from: C:\Program Files\mosquitto\
REM Or run as Administrator if permissions are needed.
REM ─────────────────────────────────────────────────────────────────────────────

SET MOSQUITTO_DIR=C:\Program Files\mosquitto
SET PASSWD_FILE=%MOSQUITTO_DIR%\passwd.txt

echo.
echo =========================================
echo  Scooter Platform — MQTT Auth Setup
echo =========================================
echo.

REM Create password file with the server user (use -c to create new file)
echo [1/2] Creating server user: scooter-server
"%MOSQUITTO_DIR%\mosquitto_passwd.exe" -b -c "%PASSWD_FILE%" scooter-server server@Secure#2024

REM Add IoT device user (use -b without -c to APPEND, not overwrite)
echo [2/2] Adding device user: iot-device
"%MOSQUITTO_DIR%\mosquitto_passwd.exe" -b "%PASSWD_FILE%" iot-device device@Secure#2024

echo.
echo ✅ Password file created at: %PASSWD_FILE%
echo.
echo Next steps:
echo   1. Copy mosquitto.conf and acl.txt to %MOSQUITTO_DIR%\
echo   2. Stop any running Mosquitto: net stop mosquitto
echo   3. Start with config:  mosquitto -v -c "%MOSQUITTO_DIR%\mosquitto.conf"
echo.
pause
