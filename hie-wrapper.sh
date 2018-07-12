#!/usr/bin/env bash
DEBUG=1
indent=""
function debug {
  if [[ $DEBUG == 1 ]]; then
    echo "$indent$@" >> /tmp/hie-wrapper.log
  fi
}

curDir=`pwd`
debug "Launching HIE for project located at $curDir"
indent="  "


HIEBIN='hie-wrapper'
debug "Starting HIE"

# Check that HIE is working
export HIE_SERVER_PATH=`which $HIEBIN`

if [ "X" = "X$HIE_SERVER_PATH" ]; then
  echo "Content-Length: 100\r\n\r"
  echo '{"jsonrpc":"2.0","id":1,"error":{"code":-32099,"message":"Cannot find hie in the path"}}'
  exit 1
fi

# Run directly
$HIEBIN --lsp $@
# $HIEBIN --lsp

# Run with a log
# $HIEBIN --lsp -d -l /tmp/hie.log $@
# $HIEBIN --lsp -d -l /tmp/hie.log --ekg $@
# $HIEBIN --lsp -d -l /tmp/hie.log --vomit $@

# Run with a log and a direct dump of the server output
# $HIEBIN --lsp -d -l /tmp/hie.log | tee /tmp/hie-wire.log
