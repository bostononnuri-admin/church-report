#!/bin/bash
# 백엔드 배포: 코드 올리기 → 기존 배포를 새 버전으로 갱신 (URL 유지)
set -e
cd "$(dirname "$0")"
clasp push
clasp create-deployment --deploymentId AKfycbzztaNejz8nkgug16NWI3lZtBlMSSTUHpTh0j4odURkmlWrqa67t0s8mvbaa70fGFS6_Q --description "${1:-update}"
