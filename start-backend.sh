#!/bin/bash

set -e

cd website
source bin/activate
FLASK_DEBUG=1 FLASK_ENV=dev python -i app.py
