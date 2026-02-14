@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "PY_VENV=C:\Users\jfhut\pymupdf-venv\Scripts\python.exe"
set "PYTHON_EXE="

if exist "%PY_VENV%" (
  set "PYTHON_EXE=%PY_VENV%"
) else (
  where py >nul 2>nul
  if %ERRORLEVEL% EQU 0 (
    set "PYTHON_EXE=py -3"
  ) else (
    where python >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
      set "PYTHON_EXE=python"
    )
  )
)

if "%PYTHON_EXE%"=="" (
  echo Could not find a Python interpreter.
  echo Try installing Python, then run:
  echo   py -3 scripts\csv_sections_to_yaml.py [args]
  exit /b 1
)

%PYTHON_EXE% "%SCRIPT_DIR%csv_sections_to_yaml.py" %*
exit /b %ERRORLEVEL%
