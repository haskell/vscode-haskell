#!/bin/sh

export HIE_SERVER_PATH=`which hie-vscode`

if [ "X" = "X$HIE_SERVER_PATH" ]; then
  echo "Content-Length: 188\r\n\r"
  echo '{"command":"initialize","success":false,"request_seq":1,"seq":1,"type":"response","message":"hie-vscode.exe is not found. Run `stack install hie-vscode`, and put it to PATH environment."}'

  exit 1
fi

hie-vscode
