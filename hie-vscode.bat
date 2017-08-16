@echo off

set HIE_SERVER_PATH=
for /f "delims=" %%p in ('where hie') do set HIE_SERVER_PATH=%%p

if [%HIE_SERVER_PATH%] == [] (
  echo Content-Length: 100
  echo:
  echo {"jsonrpc":"2.0","id":1,"error":{"code":-32099,"message":"Cannot find hie.exe in the path"}}
  exit 1
)

hie --lsp %1 %2 %3 %4 %5 %6 %7 %8 %9
