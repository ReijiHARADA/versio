# スマートフォンで読むための EPUB 書き出し

Paper Reader は翻訳済み論文を EPUB 3 として保存できます。自前のサーバーや
スマートフォン用アプリは必要ありません。

1. Reader の右上から「書き出す」を開き、「EPUB（Apple Books / Kindle）」を選ぶ。
2. 翻訳失敗箇所を除外する場合はチェックを付けず、原文を残したい場合だけ
   「翻訳失敗箇所を含める」を選ぶ。
3. macOS の保存先を選ぶ。
4. iPhone / iPad では AirDrop または iCloud Drive 経由で Apple Books に開く。
   Kindle では EPUB を Send to Kindle の通常の受け渡し方法で送る。

Apple の Books は Mac から EPUB を読み込めます（[Apple Support](https://support.apple.com/en-ie/guide/books/ibkseed72068/mac)）。
Kindle は Send to Kindle で EPUB を受け付けます（[Amazon Help](https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA)）。

同期先を固定する場合は「設定 → ライブラリとデータ → スマートフォン用 EPUB
同期」で iCloud Drive または Google Drive の既存フォルダを選びます。EPUB 書き出し
ダイアログの「保存後に同期先フォルダへコピー」を明示的に選んだ論文だけが対象です。
自動同期、OAuth、クラウド API への接続、Paper Reader 内の原本削除は行いません。
同じ論文を再度同期すると同じファイル名を安全に置き換えます。

EPUB の内容は現行の Paper Package を元に生成され、タイトル、著者、見出し、目次、
画像、表、数式、脚注、参考文献を XHTML として収録します。Apple Books / Kindle の
実機表示は端末やアプリのバージョンで変わるため、配布前に代表的な論文を一度確認して
ください。
