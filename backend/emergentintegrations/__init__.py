"""Local stub for emergentintegrations used for local development/testing."""

class EmergentClient:
    def __init__(self, api_key: str = None):
        self.api_key = api_key

    def do_something(self, *args, **kwargs):
        raise NotImplementedError("Local emergentintegrations stub: implement when available")


def get_client(api_key: str = None):
    return EmergentClient(api_key=api_key)
