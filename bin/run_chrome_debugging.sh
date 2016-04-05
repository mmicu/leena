#!/bin/bash

# Default port for the remote debugging protocol
PORT=9222

if [[ "$OSTYPE" == "linux-gnu" ]]; then
  RUN_CHROME=`google-chrome --remote-debugging-port=$PORT`
elif [[ "$OSTYPE" == "darwin"* ]]; then
  # Chrome
  #RUN_CHROME=`open /Applications/Google\ Chrome.app --args --enable-speech-input --remote-debugging-port=$PORT`

  # Chrome Canary
  RUN_CHROME=`open /Applications/Google\ Chrome\ Canary.app --args --enable-speech-input --remote-debugging-port=$PORT`
else
  echo "Unknown OS. Try to run Chrome manually."
  exit
fi

# Run Chrome
$RUN_CHROME
