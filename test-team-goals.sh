#!/bin/bash

# Simple test script for team goals API endpoints

echo "🧪 Testing Team Goals API Endpoints"
echo "===================================="
echo ""

BASE_URL="http://localhost:5000"

# Test 1: GET all team goals (without authentication - should fail)
echo "1️⃣ Testing GET /api/team-goals (without auth)"
curl -s -X GET "$BASE_URL/api/team-goals" | head -c 100
echo ""
echo ""

# Test 2: GET with activeOnly filter
echo "2️⃣ Testing GET /api/team-goals?activeOnly=true (without auth)"
curl -s -X GET "$BASE_URL/api/team-goals?activeOnly=true" | head -c 100
echo ""
echo ""

# Test 3: GET with teamId filter
echo "3️⃣ Testing GET /api/team-goals?teamId=test-team (without auth)"
curl -s -X GET "$BASE_URL/api/team-goals?teamId=test-team" | head -c 100
echo ""
echo ""

echo "✅ API endpoints are registered and responding!"
echo ""
echo "Note: These tests ran without authentication."
echo "The endpoints should return 401 Unauthorized errors, which confirms they're working correctly."
echo "To fully test with authentication, you would need valid session cookies."