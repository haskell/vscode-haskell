#!/bin/sh

export HIE_SERVER_PATH=`which hie`
export HIE_WRAPPER_PATH=`which hie-wrapper`

if [ ! "X" = "X$HIE_WRAPPER_PATH" ]; then
  hie-wrapper $@
elif [ "X" = "X$HIE_SERVER_PATH" ]; then
  echo "Content-Length: 100\r\n\r"
  echo '{"jsonrpc":"2.0","id":1,"error":{"code":-32099,"message":"Cannot find hie.exe in the path"}}'
  exit 1
else
  # Run directly
  hie $@
fi

# Run with a log
# hie --lsp -d -l /tmp/hie.log $@
# hie --lsp -d -l /tmp/hie.log --ekg $@
# hie --lsp -d -l /tmp/hie.log --vomit $@

# Run with a log and a direct dump of the server output
#hie --lsp -d -l /tmp/hie.log | tee /tmp/hie-wire.log

# Run the 'lsp-hello' server instead
#lsp-hello
