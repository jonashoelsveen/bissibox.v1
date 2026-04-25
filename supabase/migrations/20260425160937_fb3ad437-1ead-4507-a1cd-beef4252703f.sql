CREATE POLICY "VerificationAttempts: no direct client access"
ON public.verification_attempts
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);