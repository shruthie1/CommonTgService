export default function isPermanentError(errorDetails: {
    error?: any;
    message: string;
    status?: number;
}): boolean;
