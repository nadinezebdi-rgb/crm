"""Local stub of the private `litellm` package used for local development/testing.

This stub provides minimal placeholders so the application can import the
package when the private wheel is not available.
"""

__version__ = "1.0.0-stub"

def infer(prompt: str, **kwargs):
    """Simple stub function returning a predictable response.

    Real package provides LLM inference; this stub returns a placeholder.
    """
    return {"text": "[stub] inference unavailable in local dev"}


class Client:
    def __init__(self, *args, **kwargs):
        pass

    def generate(self, prompt: str, **kwargs):
        return infer(prompt, **kwargs)
