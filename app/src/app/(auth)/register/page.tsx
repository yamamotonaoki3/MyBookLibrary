import Link from "next/link";
import { isDemoMode } from "@/lib/demoMode";
import { RegisterForm } from "./_components/RegisterForm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export const metadata = { title: "新規登録 | MyBookLibrary" };

export default function RegisterPage() {
  const demoMode = isDemoMode();
  return (
    <Card className="w-full max-w-sm shadow-md">
      <CardHeader className="pb-2 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-violet-600">
          <BookOpen className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">MyBookLibrary</h1>
        <p className="text-sm text-muted-foreground">新規アカウントを作成</p>
      </CardHeader>
      <CardContent>
        {demoMode ? (
          <div data-testid="demo-register-notice" className="space-y-3 text-center text-sm">
            <p>デモ環境では、新規登録できません（個人情報を入力しないでください）。</p>
            <Link href="/login" className="text-violet-600 underline underline-offset-4 hover:text-violet-700">
              ログイン画面へ（デモアカウントを案内しています）
            </Link>
          </div>
        ) : (
          <RegisterForm />
        )}
      </CardContent>
    </Card>
  );
}
