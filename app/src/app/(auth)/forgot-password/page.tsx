import { ForgotPasswordForm } from "./_components/ForgotPasswordForm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export const metadata = { title: "パスワードをお忘れの方 | MyBookLibrary" };

export default function ForgotPasswordPage() {
  return (
    <Card className="w-full max-w-sm lg:max-w-lg shadow-lg">
      <CardHeader className="pb-2 pt-6 text-center lg:pb-4 lg:pt-8">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 lg:mb-4 lg:h-16 lg:w-16">
          <BookOpen className="h-5 w-5 text-white lg:h-8 lg:w-8" />
        </div>
        <h1 className="text-xl font-bold tracking-tight lg:text-2xl">パスワードをお忘れの方</h1>
        <p className="text-sm text-muted-foreground lg:text-base">
          登録済みのメールアドレスを入力してください
        </p>
      </CardHeader>
      <CardContent className="px-6 pb-6 lg:px-8 lg:pb-8">
        <ForgotPasswordForm />
      </CardContent>
    </Card>
  );
}
