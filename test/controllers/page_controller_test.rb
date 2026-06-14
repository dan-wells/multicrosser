require 'test_helper'
require 'minitest/mock'

class PageControllerTest < ActionDispatch::IntegrationTest
  test "should get index" do
    sample = Crossword.new(
      'title' => 'Cryptic crossword No 12345',
      'series' => 'cryptic',
      'identifier' => '12345',
      'date' => '2026-06-01T00:00:00Z',
    )
    Series.stub :get_all, [['cryptic', [sample]]] do
      get root_url
      assert_response :success
    end
  end
end
