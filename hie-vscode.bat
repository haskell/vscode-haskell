@echo off

set HIE_SERVER_PATH=
for /f "delims=" %%p in ('where hie') do set HIE_SERVER_PATH=%%p

set HIE_WRAPPER_PATH=
for /f "delims=" %%p in ('where hie-wrapper') do set HIE_WRAPPER_PATH=%%p

rem Need to check that neither is found
if [%HIE_WRAPPER_PATH%] == [] (
  echo Content-Length: 100
  echo:
  echo {"jsonrpc":"2.0","id":1,"error":{"code":-32099,"message":"Cannot find hie.exe in the path"}}
  exit 1
)

rem Fix for access violations: https://github.com/commercialhaskell/stack/issues/3765#issuecomment-436407467
set __COMPAT_LAYER=

rem Need to run hie-wrapper if found, else hie
hie-wrapper --lsp %1 %2 %3 %4 %5 %6 %7 %8 %9
