-- CreateIndex
CREATE UNIQUE INDEX `notifications_user_id_type_book_isbn_key` ON `notifications`(`user_id`, `type`, `book_isbn`);
