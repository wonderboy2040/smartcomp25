#!/bin/bash
# E2E test: invoice/quote/job payment flows through real API routes
set -e
cd /home/user/smartcomp

# Cleanup on exit
cleanup() {
  kill $DEV_PID $MOCK_PID 2>/dev/null || true
}
trap cleanup EXIT

echo "=== Starting mock Apps Script ==="
node scripts/mock-apps-script.js > /tmp/mock.log 2>&1 &
MOCK_PID=$!
sleep 2

echo "=== Starting Next dev server ==="
APPS_SCRIPT_URL=http://127.0.0.1:4100/exec npm run dev > /tmp/dev.log 2>&1 &
DEV_PID=$!

# Wait for server
for i in $(seq 1 40); do
  if curl -s -o /dev/null --max-time 3 http://localhost:3000/api/health 2>/dev/null; then
    echo "Server ready (${i}x2s)"
    break
  fi
  sleep 2
done

PASS=0; FAIL=0
check() { # check <desc> <cond>
  if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "✅ $1";
  else FAIL=$((FAIL+1)); echo "❌ $1"; fi
}

echo ""
echo "══════════ TEST 1: Invoice create with amountPaid → payment recorded ══════════"
# Create customer first
CUST=$(curl -s --max-time 30 -X POST http://localhost:3000/api/customers -H "Content-Type: application/json" -d '{"name":"Payment Test Customer","phone":"9000000001"}')
CUST_ID=$(echo "$CUST" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])")
echo "customer: $CUST_ID"

# Create invoice with 5000 paid on 10000 total
INV=$(curl -s --max-time 40 -X POST http://localhost:3000/api/invoices -H "Content-Type: application/json" -d "{\"customerId\":\"$CUST_ID\",\"items\":[{\"name\":\"HP Laptop\",\"quantity\":1,\"rate\":10000,\"gstApplicable\":false,\"gstRate\":0,\"costPrice\":8000}],\"amountPaid\":5000,\"paymentType\":\"upi\",\"deductStock\":false}")
INV_ID=$(echo "$INV" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',''))")
INV_STATUS=$(echo "$INV" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('paymentStatus',''))")
INV_PAID=$(echo "$INV" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('amountPaid',0))")
INV_DUE=$(echo "$INV" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('amountDue',0))")
echo "invoice: $INV_ID status=$INV_STATUS paid=$INV_PAID due=$INV_DUE"
check "Invoice paymentStatus=partial" "$([ "$INV_STATUS" = "partial" ] && echo 1 || echo 0)"
check "Invoice amountPaid=5000" "$([ "$INV_PAID" = "5000" ] && echo 1 || echo 0)"
check "Invoice amountDue=5000" "$([ "$INV_DUE" = "5000" ] && echo 1 || echo 0)"

# CRITICAL: payment must be in Payments list
PAYS=$(curl -s --max-time 30 "http://localhost:3000/api/payments?invoiceId=$INV_ID")
PAY_COUNT=$(echo "$PAYS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))")
PAY_TYPE=$(echo "$PAYS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['type'] if d else 'none')")
PAY_AMT=$(echo "$PAYS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['amount'] if d else 0)")
echo "payments found: $PAY_COUNT, type=$PAY_TYPE, amt=$PAY_AMT"
check "Payment row created in Payments sheet (THE BUG FIX)" "$([ "$PAY_COUNT" = "1" ] && echo 1 || echo 0)"
check "Payment type normalized UPI" "$([ "$PAY_TYPE" = "UPI" ] && echo 1 || echo 0)"
check "Payment amount = 5000" "$([ "$PAY_AMT" = "5000" ] && echo 1 || echo 0)"

echo ""
echo "══════════ TEST 2: Invoice detail shows payments ══════════"
DET=$(curl -s --max-time 30 "http://localhost:3000/api/invoices/$INV_ID")
DET_PAYS=$(echo "$DET" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('payments',[])))")
check "Invoice GET returns payments array (count=1)" "$([ "$DET_PAYS" = "1" ] && echo 1 || echo 0)"

echo ""
echo "══════════ TEST 3: Over-payment guard ══════════"
OVR=$(curl -s --max-time 30 -X POST http://localhost:3000/api/payments -H "Content-Type: application/json" -d "{\"invoiceId\":\"$INV_ID\",\"amount\":99999,\"type\":\"Cash\"}")
OVR_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 -X POST http://localhost:3000/api/payments -H "Content-Type: application/json" -d "{\"invoiceId\":\"$INV_ID\",\"amount\":99999,\"type\":\"Cash\"}")
echo "overpay response: $OVR (http $OVR_CODE)"
check "Over-payment rejected (400)" "$([ "$OVR_CODE" = "400" ] && echo 1 || echo 0)"

echo ""
echo "══════════ TEST 4: Pay remaining balance → paid ══════════"
REM=$(curl -s --max-time 30 -X POST http://localhost:3000/api/payments -H "Content-Type: application/json" -d "{\"invoiceId\":\"$INV_ID\",\"amount\":5000,\"type\":\"Cash\"}")
INV2=$(curl -s --max-time 30 "http://localhost:3000/api/invoices/$INV_ID")
ST2=$(echo "$INV2" | python3 -c "import json,sys; print(json.load(sys.stdin).get('paymentStatus',''))")
PAID2=$(echo "$INV2" | python3 -c "import json,sys; print(json.load(sys.stdin).get('amountPaid',0))")
check "Invoice now fully paid" "$([ "$ST2" = "paid" ] && echo 1 || echo 0)"
check "amountPaid = 10000" "$([ "$PAID2" = "10000" ] && echo 1 || echo 0)"

echo ""
echo "══════════ TEST 5: Quotation convert with amountPaid ══════════"
QT=$(curl -s --max-time 40 -X POST http://localhost:3000/api/quotations -H "Content-Type: application/json" -d "{\"customerId\":\"$CUST_ID\",\"items\":[{\"name\":\"Printer\",\"quantity\":1,\"rate\":8000,\"gstApplicable\":false,\"gstRate\":0,\"costPrice\":6000}]}")
QT_ID=$(echo "$QT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
echo "quotation: $QT_ID"
CV=$(curl -s --max-time 40 -X POST "http://localhost:3000/api/quotations/$QT_ID" -H "Content-Type: application/json" -d '{"action":"convert","amountPaid":3000,"paymentType":"cash","deductStock":false}')
echo "convert resp: $CV"
CV_INV=$(echo "$CV" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('invoiceId',''))")
check "Quotation converted" "$([ -n "$CV_INV" ] && [ "$CV_INV" != "None" ] && echo 1 || echo 0)"
CV_PAYS=$(curl -s --max-time 30 "http://localhost:3000/api/payments?invoiceId=$CV_INV")
CV_PAY_N=$(echo "$CV_PAYS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))")
CV_PAY_AMT=$(echo "$CV_PAYS" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['amount'] if d else 0)")
check "Convert payment row created" "$([ "$CV_PAY_N" = "1" ] && echo 1 || echo 0)"
check "Convert payment amount = 3000" "$([ "$CV_PAY_AMT" = "3000" ] && echo 1 || echo 0)"
CUST2=$(curl -s --max-time 30 "http://localhost:3000/api/customers?search=Payment+Test")
CREDIT=$(echo "$CUST2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
c=[x for x in d if x['id']=='$CUST_ID']
print(c[0].get('creditBalance',0) if c else '?')")
echo "customer credit after convert (expect 5000 = 8000-3000): $CREDIT"
check "Credit = only unpaid portion (5000)" "$([ "$CREDIT" = "5000.0" ] || [ "$CREDIT" = "5000" ] && echo 1 || echo 0)"

echo ""
echo "══════════ TEST 6: Job advance payment recorded ══════════"
JOB=$(curl -s --max-time 40 -X POST http://localhost:3000/api/jobs -H "Content-Type: application/json" -d '{"customerName":"Job Customer","customerMobile":"9000000002","problemDesc":"Screen repair","estimatedAmount":3000,"advanceAmount":1000,"advanceMode":"Cash"}')
JOB_ID=$(echo "$JOB" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
JOB_JOBID=$(echo "$JOB" | python3 -c "import json,sys; print(json.load(sys.stdin).get('jobId',''))")
echo "job: $JOB_ID ($JOB_JOBID)"
SP=$(curl -s --max-time 30 "http://localhost:3000/api/service-payments")
SP_N=$(echo "$SP" | python3 -c "import json,sys; d=json.load(sys.stdin); pays=d.get('payments',[]); print(len([p for p in pays if p.get('jobId')=='$JOB_JOBID']))")
check "Job advance recorded in ServicePayments" "$([ "$SP_N" = "1" ] && echo 1 || echo 0)"

echo ""
echo "══════════ TEST 7: Invoice edit with amountPaid increase → delta payment ══════════"
# Create a fresh unpaid invoice
INV3=$(curl -s --max-time 40 -X POST http://localhost:3000/api/invoices -H "Content-Type: application/json" -d "{\"customerId\":\"$CUST_ID\",\"items\":[{\"name\":\"Monitor\",\"quantity\":1,\"rate\":6000,\"gstApplicable\":false,\"gstRate\":0,\"costPrice\":4000}],\"amountPaid\":0,\"deductStock\":false}")
INV3_ID=$(echo "$INV3" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
echo "unpaid invoice: $INV3_ID"
# Edit: increase amountPaid to 2000 (delta 2000 → payment row)
PUT=$(curl -s --max-time 40 -X PUT "http://localhost:3000/api/invoices/$INV3_ID" -H "Content-Type: application/json" -d '{"amountPaid":2000}')
PUT_PAID=$(echo "$PUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('amountPaid',0))")
PUT_DUE=$(echo "$PUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('amountDue',0))")
PUT_ST=$(echo "$PUT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('paymentStatus',''))")
echo "after edit: paid=$PUT_PAID due=$PUT_DUE status=$PUT_ST"
check "Edit updated amountPaid=2000" "$([ "$PUT_PAID" = "2000" ] && echo 1 || echo 0)"
check "Edit updated amountDue=4000" "$([ "$PUT_DUE" = "4000" ] && echo 1 || echo 0)"
check "Edit status=partial" "$([ "$PUT_ST" = "partial" ] && echo 1 || echo 0)"
P3=$(curl -s --max-time 30 "http://localhost:3000/api/payments?invoiceId=$INV3_ID")
P3_N=$(echo "$P3" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d))")
P3_A=$(echo "$P3" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['amount'] if d else 0)")
check "Delta payment row created (2000)" "$([ "$P3_N" = "1" ] && [ "$P3_A" = "2000" ] && echo 1 || echo 0)"

echo ""
echo "══════════ RESULTS ══════════"
echo "PASS: $PASS  FAIL: $FAIL"
[ "$FAIL" = "0" ] && echo "ALL TESTS PASSED ✅" || echo "SOME TESTS FAILED ❌"
exit $FAIL
