#!/bin/bash
# .env dosya erişim koruması
# Bu hook, .env dosyalarının yanlışlıkla okunmasını veya değiştirilmesini engeller

FILE="$1"

if [[ "$FILE" == *.env* ]] && [[ "$FILE" != *.env.example ]]; then
  echo "BLOCKED: .env dosyalarına doğrudan erişim yasaktır. .env.example kullanın."
  exit 1
fi

exit 0
