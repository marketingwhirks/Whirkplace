#!/bin/bash

echo "🔧 Setting TESTING_LOCALHOST environment variable..."
export TESTING_LOCALHOST=true

echo "⚠️  Note: The main workflow needs to be restarted with TESTING_LOCALHOST=true"
echo "    for the session cookies to work over HTTP localhost"
echo ""
echo "🔍 Running session cookie test..."

node test-session-cookie.js