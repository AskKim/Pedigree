#!/usr/bin/env bash
set -euo pipefail
BASE=/home/antigravity/AskKim/Pedigree/prompts/preflight

declare -A files=(
  [1CHn5xT3LkLSYes9S4huT-hM1bxJQgcWYs95HJwP9jSw]=handoff-state.schema.json.md
  [1AFurg0EpZjfLkOFHgj3LFMYsFf1VtAEKLY--EH7eojo]=human-review-needed.md
  [10mHVCnacrcIpDtAy1DcoM2JwpXWqzZeGcTsFRL37FCY]=pf-launcher-uni-readme.md
  [1tkDAPbSkU__nhNeupCfXOPTf3bbsay-VcWTN0kOBrm0]=pf-launcher-uni-wiring.md
  [10U_zVl1DeIF-NkE2Mpj0tOLVGvE-rye_rGy7YaoV0Uo]=pf-launcher-uni.md
  [1BxdWOIYf1rOlVkBiNMgwFAyHWoZRKW3CGWoVfAthtOg]=preflight.config.json
)

declare -A rununi=(
  [1No_tMuLiSEkPC9NU6PHAFU2GO25iY8djfaDLVJ9FlBk]=a11y-check.md
  [1s2JGCIG-H7qTbqJjc8-S4bvwFUXtNpCQ8k1srNGmRTE]=a11y.md
  [1KxWrTSRjKf0rgoqjeqGefQ3uOZerAO-Bg8P5c8rsO-o]=ai.md
  [1dVrbPDpOUCqxOug6meMJbGbewzu9uGRndX4QWyCRajI]=audit.md
  [1Xm6YBUTrEWSW1_pt5HvDBJT0aOJ8IR2rqYIv9_y8mGU]=backup-check.md
  [1Zgd8V5qsslVTZnsToOGo4ImJaYWT3WhqiNC_RMNz8Yg]=backup-setup.md
  [1XyoKl8BKQh6SSKWijVaZ0uqslNHwcSLU2-xSDdj3D0Q]=ci-guide.md
  [1hoWpcQCAJwlXFsBv8oorovIWCOQU9wt9H5WW8r1KU08]=ci-setup.md
  [12LvUI4vDIZP0DIW8_IaVfkIBuUL0VA406ZpK4W0WWUM]=crawl-guide.md
  [1yVmB_72XdDoznyUj9xn6m5d1JUbksLdeiTIhK3Cmw6E]=crawl-setup.md
  [1GQbZ098speKUnxCcqX2PtM4IOX_J_1pOlOJTZqxdF-c]=guardrails.md
  [1CyYcqo7x5WUUyOy2FWKpQ23hdgwaAky2UMKmkqjIpV0]=release-check.md
  [1Rwp4uyWzxb_QOAdRWdy5SUO88IZHc7g0evbONQ8IOlE]=release-plan.md
  [1r8aBZEk-T8cioh3pZNN663jOVkkTGg5kGTNQCY3sbKw]=ver-update.md
)

declare -A readfiles=(
  [1J9dWpPIHJweDgJGjkeeHRQ3YG2YOffWN8hC0Dt_nSDY]=a11y-check-readme.md
  [1pC1FeZQX3SCL56DFOEbMOmTHN3JNQRgfXvndWnN1kx0]=a11y-readme.md
  [1IjZefili_tYWB9B5mGmqjGkkGNmCYNqafEGyOPvmz1k]=ai-readme.md
  [138WPbUVcBRZ7xrbM56MteyWw_7oTz9taoEuZF4stnrc]=audit-readme.md
  [1Vu8Ckr59WP-zUTXgggBH6ydQuWvihWYH_Y4gIZq2ero]=backup-check-readme.md
  [1zFwaoy8Ig872vb5V9sPoZgpDWaJKveWeCBp5Ni7ohe4]=backup-setup-readme.md
  [1HdL08oaWG6jMI_dioiZ_fWrcenUtLt6VzNkP1Egr8Zg]=ci-guide-readme.md
  [1rJ_Pq95QCKYWI4ryMuEmcFIMLNmXg1g8mH_s_tZ0LMA]=ci-setup-readme.md
  [1zk6P817up0_mqHGTCe7mDOrsGh9x407HyMFaOwEU8II]=crawl-guide-readme.md
  [1VCKFudjm-ny4Q6Cb_wqKmEmdYdO2igml-p8fYt6fan8]=crawl-setup-readme.md
  [1f8iwh-1UuoEMXWeSpOTTPzsqQ0h_XFO-mUmbezHeANc]=guardrails-readme.md
  [1a25lRc0vBP5dJWGP_n56_ZILZimQJ4W4NFooRw9sm4g]=release-check-readme.md
  [1brcySNlXwcy9DAtZz3TdBhChM_cdIoKF-tmAsvdrANQ]=release-plan-readme.md
  [1lDwiprjY2U3G4Tg1Pv-b_vPBF8l70ZR-x6AlcNVwPrc]=ver-update-readme.md
)

declare -A scripts=(
  [1EftyytD8NCXOncQLzmq_DI4Bg7DBfJ_R2_JsIQpbbbw]=preflight-lint.mjs
  [1bP2nRhbE0V4d7mfGsOdPNk65sDKE2ssLjTH0uUPke38]=preflight-log.mjs
  [1T1Y7BjsP0YpppfesPYyR5ngQNxNuBxdFe0T7ggL4MFs]=preflight-reset.mjs
  [1Dz_M3hy1IUYBwcMNPnoDg7u19VDeIVdCSA1X_gvjIEg]=preflight-rollback.mjs
  [1dCklPKkqBmgMVv4r9hMPkXeW7EV0hgE1LB5FnOakRmw]=preflight-run-context.mjs
  [1AJoBKlE2hQLSlliZRzxkFlyY6xzEGVGDSlyXTNr1_oA]=preflight-state.mjs
)

declare -A templates=(
  [1N2mZ81qofbLXX-nNK8hAkytmSJuDHBLU]=pf-launcher-uni-clean.md
)

export_file(){
  local id=$1
  local out=$2
  echo "Exporting $id to $out"
  gdrive readonly export "$id" "$out" --format md
}

# Export main files
for id in "${!files[@]}"; do
  export_file "$id" "$BASE/${files[$id]}"
done

# Export run-uni files
RUNUNI_DIR="$BASE/run-uni"
mkdir -p "$RUNUNI_DIR"
for id in "${!rununi[@]}"; do
  export_file "$id" "$RUNUNI_DIR/${rununi[$id]}"
done

# Export read folder
READ_DIR="$RUNUNI_DIR/read"
mkdir -p "$READ_DIR"
for id in "${!readfiles[@]}"; do
  export_file "$id" "$READ_DIR/${readfiles[$id]}"
done

# Export scripts
SCRIPT_DIR="$BASE/scripts"
mkdir -p "$SCRIPT_DIR"
for id in "${!scripts[@]}"; do
  export_file "$id" "$SCRIPT_DIR/${scripts[$id]}"
done

# Export templates
TEMPLATE_DIR="$BASE/templates"
mkdir -p "$TEMPLATE_DIR"
for id in "${!templates[@]}"; do
  export_file "$id" "$TEMPLATE_DIR/${templates[$id]}"
done

