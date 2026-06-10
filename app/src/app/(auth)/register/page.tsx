import { RegisterForm } from "./_components/RegisterForm";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export const metadata = { title: "新規登録 | MyBookLibrary" };

export default function RegisterPage() {
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
        <RegisterForm />
      </CardContent>
    </Card>
  );
}
